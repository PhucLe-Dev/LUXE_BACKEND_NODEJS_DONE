const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các models và middlewares cần thiết
const middlewaresController = require('../controller/middlewaresController');
const DonHang = mongoose.model('don_hang');
const NguoiDung = mongoose.model('nguoi_dung');
const SanPham = mongoose.model('san_pham');
const Voucher = mongoose.model('voucher');

// ======================================================
// 1. Lấy danh sách tất cả đơn hàng (Đã cập nhật để trả về giá đúng)
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            trang_thai_don_hang,
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

        const orders = await DonHang.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('id_customer', 'ho_ten email sdt avatar')
            .populate('id_shipper', 'ho_ten email sdt avatar')
            .populate('id_voucher', 'code discount_type discount_value')
            .lean();

        // Populate thông tin chi tiết sản phẩm cho mỗi đơn hàng
        for (const order of orders) {
            for (let i = 0; i < order.chi_tiet.length; i++) {
                const item = order.chi_tiet[i];
                if (item.id_variant) {
                    const product = await SanPham.findOne({ 'variants._id': item.id_variant });
                    if (product) {
                        const variant = product.variants.id(item.id_variant);
                        if (variant) {
                            // Gán lại id_variant thành một object đầy đủ thông tin
                            order.chi_tiet[i].id_variant = {
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
        }

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
// 2. Lấy chi tiết một đơn hàng (Đã cập nhật để trả về giá đúng)
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
            .lean(); // Dùng .lean() để có thể chỉnh sửa object

        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
        }

        // Populate thông tin sản phẩm và quan trọng là THÊM LẠI GIÁ GỐC
        for (let i = 0; i < order.chi_tiet.length; i++) {
            const item = order.chi_tiet[i];
            if (item.id_variant) {
                const product = await SanPham.findOne({ 'variants._id': item.id_variant }).lean();
                if (product) {
                    const variant = product.variants.find(v => v._id.equals(item.id_variant));
                    if (variant) {
                        // **SỬA LỖI QUAN TRỌNG**:
                        // 1. Nếu `gia_goc` chưa được lưu trong đơn hàng (cho các đơn hàng cũ),
                        //    hãy lấy giá gốc hiện tại của sản phẩm để hiển thị.
                        if (item.gia_goc === undefined) {
                            item.gia_goc = variant.gia;
                        }

                        // 2. Populate các thông tin khác của variant để hiển thị
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
// CHỨC NĂNG MỚI: TẠO ĐƠN HÀNG THỦ CÔNG (ĐÃ SỬA LỖI)
// POST /api/admin/orders
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            ho_ten,
            email,
            sdt,
            dia_chi_giao_hang,
            phuong_thuc_thanh_toan,
            ghi_chu,
            chi_tiet
        } = req.body;

        // --- B1: Validate dữ liệu cơ bản ---
        if (!ho_ten || !sdt || !dia_chi_giao_hang || !chi_tiet || chi_tiet.length === 0) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp đủ thông tin khách hàng và sản phẩm." });
        }

        // --- SỬA LỖI 1: Tìm khách hàng theo email ---
        // Bắt buộc phải có email để liên kết hoặc tìm khách hàng
        if (!email) {
            return res.status(400).json({ success: false, message: "Email khách hàng là bắt buộc để tạo đơn hàng." });
        }
        const customer = await NguoiDung.findOne({ email: email.toLowerCase() });
        if (!customer) {
            return res.status(404).json({ success: false, message: `Không tìm thấy khách hàng với email: ${email}. Vui lòng tạo tài khoản cho khách trước.` });
        }

        let tong_tien = 0;
        const chiTietDonHang = [];

        // --- B2: Xử lý chi tiết sản phẩm ---
        for (const item of chi_tiet) {
            const variantSku = item.id_variant;
            if (!variantSku || !item.so_luong || item.so_luong <= 0) {
                return res.status(400).json({ success: false, message: `Sản phẩm không hợp lệ trong giỏ hàng.` });
            }

            const product = await SanPham.findOne({ 'variants.sku': variantSku });
            if (!product) {
                return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm với SKU: ${variantSku}` });
            }

            const variant = product.variants.find(v => v.sku === variantSku);
            if (!variant) {
                return res.status(404).json({ success: false, message: `SKU ${variantSku} không tồn tại.` });
            }

            if (variant.so_luong < item.so_luong) {
                return res.status(400).json({ success: false, message: `Sản phẩm ${variant.sku} không đủ số lượng trong kho (còn ${variant.so_luong}).` });
            }

            const giaGoc = variant.gia;
            const giaBan = variant.gia_km || variant.gia;
            tong_tien += giaBan * item.so_luong;

            // --- SỬA LỖI 3: Lưu đúng cấu trúc `gia` và thêm `gia_goc` ---
            chiTietDonHang.push({
                id_variant: variant._id,
                so_luong: item.so_luong,
                gia: giaBan,      // Trường `gia` bắt buộc theo schema, lưu giá bán thực tế
                gia_goc: giaGoc   // Thêm trường `gia_goc` để tiện hiển thị
            });

            variant.so_luong -= item.so_luong;
            await product.save();
        }

        // --- B3: Tạo mã đơn hàng ---
        const lastOrder = await DonHang.findOne().sort({ ma_don_hang: -1 });
        let newOrderCode = 'DH001';
        if (lastOrder && lastOrder.ma_don_hang) {
            const lastNum = parseInt(lastOrder.ma_don_hang.replace('DH', ''));
            newOrderCode = 'DH' + (lastNum + 1).toString().padStart(3, '0');
        }

        // --- B4: Tạo đơn hàng mới ---
        const newOrder = new DonHang({
            ma_don_hang: newOrderCode,
            id_customer: customer._id, // Sử dụng ID khách hàng đã tìm thấy
            ho_ten,
            email,
            sdt,
            dia_chi_giao_hang,
            phuong_thuc_thanh_toan,
            ghi_chu,
            chi_tiet: chiTietDonHang,
            tong_tien,
            trang_thai_thanh_toan: 'Chưa thanh toán',
            trang_thai_don_hang: 'Chờ xác nhận'
        });

        const savedOrder = await newOrder.save();
        res.status(201).json({ success: true, message: 'Tạo đơn hàng thủ công thành công!', data: savedOrder });

    } catch (error) {
        console.error("Lỗi khi tạo đơn hàng thủ công:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi tạo đơn hàng.' });
    }
});


// ======================================================
// 3. Cập nhật trạng thái đơn hàng và gán shipper
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

            // THÊM MỚI: Xử lý logic hoàn kho và voucher khi admin hủy đơn hàng
            if (trang_thai_don_hang === 'Hủy đơn hàng') {
                // Chỉ hoàn kho nếu đơn hàng chưa bị hủy trước đó để tránh hoàn kho nhiều lần
                if (orderToUpdate.trang_thai_don_hang !== 'Hủy đơn hàng') {
                    // Hoàn lại số lượng sản phẩm vào kho
                    for (const item of orderToUpdate.chi_tiet) {
                        await SanPham.updateOne(
                            { 'variants._id': item.id_variant },
                            { $inc: { 'variants.$.so_luong': item.so_luong } }
                        );
                    }
                    // Kích hoạt lại voucher nếu có
                    if (orderToUpdate.id_voucher) {
                        await Voucher.findByIdAndUpdate(orderToUpdate.id_voucher, { is_active: true });
                    }
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

        const finalOrder = await DonHang.findById(updatedOrder._id).populate('id_customer', 'ho_ten email').populate('id_shipper', 'ho_ten email').lean();

        req.io.emit('orderStatusUpdated', finalOrder);
        res.status(200).json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công.', data: finalOrder });

    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi cập nhật trạng thái đơn hàng.' });
    }
});
// ======================================================
// 4. Hủy đơn hàng
// ======================================================
router.patch('/:id/cancel', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error('ID đơn hàng không hợp lệ.');
        }

        const order = await DonHang.findById(id);
        if (!order) {
            throw new Error('Không tìm thấy đơn hàng.');
        }

        if (order.trang_thai_don_hang !== 'Chờ xác nhận' && order.trang_thai_don_hang !== 'Đã xác nhận') {
            throw new Error(`Không thể hủy đơn hàng ở trạng thái hiện tại: ${order.trang_thai_don_hang}.`);
        }

        order.trang_thai_don_hang = 'Hủy đơn hàng';
        order.updated_at = Date.now();
        await order.save();

        // Hoàn lại số lượng sản phẩm
        for (const item of order.chi_tiet) {
            const product = await SanPham.findOne({ 'variants._id': item.id_variant });
            if (product) {
                const variant = product.variants.id(item.id_variant);
                if (variant) {
                    variant.so_luong += item.so_luong;
                    await product.save();
                }
            }
        }

        // Kích hoạt lại voucher nếu có
        if (order.id_voucher) {
            const voucher = await Voucher.findById(order.id_voucher);
            if (voucher && !voucher.is_active) {
                voucher.is_active = true;
                await voucher.save();
            }
        }

        const updatedOrder = await DonHang.findById(id).populate('id_customer', 'ho_ten email').lean();

        req.io.emit('orderCancelled', updatedOrder);
        res.status(200).json({ success: true, message: 'Đơn hàng đã được hủy thành công.' });

    } catch (error) {
        console.error('Lỗi khi hủy đơn hàng:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi hủy đơn hàng.' });
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
