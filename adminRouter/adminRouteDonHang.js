const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các models và middlewares cần thiết
const middlewaresController = require('../controller/middlewaresController');
const DonHang = mongoose.model('don_hang');
const NguoiDung = mongoose.model('nguoi_dung');
const SanPham = mongoose.model('san_pham');
const Voucher = mongoose.model('voucher');
// Import dịch vụ email
const { sendOrderStatusEmail } = require('../services/emailService');

// ======================================================
// 1. Lấy danh sách tất cả đơn hàng (ĐÃ CẬP NHẬT SẮP XẾP)
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            trang_thai_don_hang,
            dateRange,
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (search) {
            query.$or = [
                { ma_don_hang: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { sdt: { $regex: search, $options: 'i' } },
                { ho_ten: { $regex: search, $options: 'i' } }
            ];
        }

        if (trang_thai_don_hang) {
            query.trang_thai_don_hang = trang_thai_don_hang;
        }

        if (dateRange) {
            const endDate = new Date();
            let startDate = new Date();

            switch (dateRange) {
                case 'today':
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'last7days':
                    startDate.setDate(endDate.getDate() - 7);
                    break;
                case 'last30days':
                    startDate.setDate(endDate.getDate() - 30);
                    break;
                case 'last90days':
                    startDate.setDate(endDate.getDate() - 90);
                    break;
                case 'last1year':
                    startDate.setFullYear(endDate.getFullYear() - 1);
                    break;
                default:
                    startDate = null;
            }

            if (startDate) {
                query.created_at = { $gte: startDate, $lte: endDate };
            }
        }

        const orders = await DonHang.find(query)
            // SỬA LỖI: Thay đổi sắp xếp từ ngày tạo sang mã đơn hàng tăng dần
            .sort({ ma_don_hang: 1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('id_customer', 'ho_ten email sdt avatar')
            .populate('id_shipper', 'ho_ten email sdt avatar')
            .populate('id_voucher', 'code discount_type discount_value')
            .lean();

        const totalOrders = await DonHang.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / parseInt(limit));

        res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalOrders,
                totalPages
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách đơn hàng.', error: error.message });
    }
});

// ======================================================
// 2. Lấy chi tiết một đơn hàng
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
        }

        const order = await DonHang.findById(id)
            .populate('id_customer', 'ho_ten email sdt avatar')
            .populate('id_shipper', 'ho_ten email sdt avatar')
            .populate('id_voucher')
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
        }

        for (let i = 0; i < order.chi_tiet.length; i++) {
            const item = order.chi_tiet[i];
            if (item.id_variant) {
                const product = await SanPham.findOne({ 'variants._id': item.id_variant }).lean();
                if (product) {
                    const variant = product.variants.find(v => v._id.equals(item.id_variant));
                    if (variant) {
                        if (item.gia_goc === undefined) {
                            item.gia_goc = variant.gia;
                        }
                        item.id_variant = {
                            _id: variant._id,
                            sku: variant.sku,
                            kich_thuoc: variant.kich_thuoc,
                            mau_sac: variant.mau_sac,
                            hinh_chinh: variant.hinh_chinh,
                            ten_sp: product.ten_sp,
                            slug: product.slug
                        };
                    }
                }
            }
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy chi tiết đơn hàng.', error: error.message });
    }
});

// ======================================================
// 3. Tạo đơn hàng thủ công
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            ho_ten, email, sdt, dia_chi_giao_hang,
            phuong_thuc_thanh_toan, ghi_chu, chi_tiet
        } = req.body;

        if (!ho_ten || !sdt || !dia_chi_giao_hang || !chi_tiet || chi_tiet.length === 0) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp đủ thông tin khách hàng và sản phẩm." });
        }
        if (!email) {
            return res.status(400).json({ success: false, message: "Email khách hàng là bắt buộc." });
        }
        const customer = await NguoiDung.findOne({ email: email.toLowerCase() });
        if (!customer) {
            return res.status(404).json({ success: false, message: `Không tìm thấy khách hàng với email: ${email}.` });
        }

        let tong_tien = 0;
        const chiTietDonHang = [];

        for (const item of chi_tiet) {
            const product = await SanPham.findOne({ 'variants.sku': item.id_variant });
            if (!product) return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm với SKU: ${item.id_variant}` });
            const variant = product.variants.find(v => v.sku === item.id_variant);
            if (!variant) return res.status(404).json({ success: false, message: `SKU ${item.id_variant} không tồn tại.` });
            if (variant.so_luong < item.so_luong) return res.status(400).json({ success: false, message: `Sản phẩm ${variant.sku} không đủ số lượng.` });

            const giaBan = variant.gia_km || variant.gia;
            tong_tien += giaBan * item.so_luong;

            chiTietDonHang.push({
                id_variant: variant._id,
                so_luong: item.so_luong,
                gia: giaBan,
                gia_goc: variant.gia
            });

            variant.so_luong -= item.so_luong;
            await product.save();
        }

        const lastOrder = await DonHang.findOne().sort({ ma_don_hang: -1 });
        let newOrderCode = 'DH001';
        if (lastOrder && lastOrder.ma_don_hang) {
            const lastNum = parseInt(lastOrder.ma_don_hang.replace('DH', ''));
            newOrderCode = 'DH' + (lastNum + 1).toString().padStart(3, '0');
        }

        const newOrder = new DonHang({
            ma_don_hang: newOrderCode, id_customer: customer._id,
            ho_ten, email, sdt, dia_chi_giao_hang,
            phuong_thuc_thanh_toan, ghi_chu,
            chi_tiet: chiTietDonHang,
            tong_tien,
            trang_thai_thanh_toan: 'Chưa thanh toán',
            trang_thai_don_hang: 'Chờ xác nhận'
        });

        const savedOrder = await newOrder.save();
        res.status(201).json({ success: true, message: 'Tạo đơn hàng thành công!', data: savedOrder });

    } catch (error) {
        console.error("Lỗi khi tạo đơn hàng thủ công:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi tạo đơn hàng.' });
    }
});

// ======================================================
// 4. Cập nhật trạng thái đơn hàng và gán shipper
// ======================================================
router.put('/:id/status', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { trang_thai_don_hang, trang_thai_thanh_toan, id_shipper } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
        }

        const orderToUpdate = await DonHang.findById(id);
        if (!orderToUpdate) {
            throw new Error('Không tìm thấy đơn hàng để cập nhật.');
        }

        const updateFields = { updated_at: Date.now() };

        if (trang_thai_don_hang) {
            const validOrderStatuses = DonHang.schema.path('trang_thai_don_hang').enumValues;
            if (!validOrderStatuses.includes(trang_thai_don_hang)) {
                return res.status(400).json({ success: false, message: `Trạng thái đơn hàng không hợp lệ.` });
            }
            updateFields.trang_thai_don_hang = trang_thai_don_hang;

            if (trang_thai_don_hang === 'Hủy đơn hàng' && orderToUpdate.trang_thai_don_hang !== 'Hủy đơn hàng') {
                for (const item of orderToUpdate.chi_tiet) {
                    await SanPham.updateOne(
                        { 'variants._id': item.id_variant },
                        { $inc: { 'variants.$.so_luong': item.so_luong } }
                    );
                }
                if (orderToUpdate.id_voucher) {
                    await Voucher.findByIdAndUpdate(orderToUpdate.id_voucher, { is_active: true });
                }
            }
        }

        if (trang_thai_thanh_toan) {
            const validPaymentStatuses = DonHang.schema.path('trang_thai_thanh_toan').enumValues;
            if (!validPaymentStatuses.includes(trang_thai_thanh_toan)) {
                return res.status(400).json({ success: false, message: `Trạng thái thanh toán không hợp lệ.` });
            }
            updateFields.trang_thai_thanh_toan = trang_thai_thanh_toan;
        }

        if (id_shipper !== undefined) {
            if (id_shipper !== null && id_shipper !== '') {
                if (!mongoose.Types.ObjectId.isValid(id_shipper)) {
                    return res.status(400).json({ success: false, message: 'ID shipper không hợp lệ.' });
                }
                const shipperExists = await NguoiDung.findOne({ _id: id_shipper, vai_tro: 'shipper' });
                if (!shipperExists) {
                    return res.status(400).json({ success: false, message: 'Shipper không tồn tại hoặc không có vai trò hợp lệ.' });
                }
            }
            updateFields.id_shipper = id_shipper;
        }

        const updatedOrder = await DonHang.findByIdAndUpdate(id, { $set: updateFields }, { new: true });

        // Gửi email sau khi cập nhật thành công
        if (trang_thai_don_hang === 'Đã xác nhận' || trang_thai_don_hang === 'Hủy đơn hàng') {
            const fullOrderDetails = await DonHang.findById(updatedOrder._id).lean();

            for (let item of fullOrderDetails.chi_tiet) {
                item.gia_ban = item.gia;
                const product = await SanPham.findOne({ 'variants._id': item.id_variant }).lean();
                if (product) {
                    const variant = product.variants.find(v => v._id.equals(item.id_variant));
                    if (variant) {
                        item.id_variant = { sku: variant.sku };
                    }
                }
            }
            await sendOrderStatusEmail(fullOrderDetails, trang_thai_don_hang);
        }

        const finalOrder = await DonHang.findById(updatedOrder._id).populate('id_customer', 'ho_ten email').populate('id_shipper', 'ho_ten email').lean();

        req.io.emit('orderStatusUpdated', finalOrder);
        res.status(200).json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công.', data: finalOrder });

    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi cập nhật trạng thái đơn hàng.' });
    }
});

// ======================================================
// 5. Xóa đơn hàng
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
        }
        const deletedOrder = await DonHang.findByIdAndDelete(id);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng để xóa.' });
        }
        req.io.emit('orderDeleted', deletedOrder._id);
        res.status(200).json({ success: true, message: 'Đơn hàng đã được xóa vĩnh viễn.', data: deletedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa đơn hàng.', error: error.message });
    }
});

module.exports = router;
