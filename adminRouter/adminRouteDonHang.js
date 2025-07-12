// adminRouter/adminRouteDonHang.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import middlewaresController từ đường dẫn tương đối chính xác
// Đảm bảo file này tồn tại và có các hàm verifyToken, verifyAdmin
const middlewaresController = require('../controller/middlewaresController');

// Lấy các Models đã được đăng ký thông qua mongoose.model()
// (Các models này sẽ được đăng ký trong index.js một lần duy nhất sau khi connect DB)
const DonHang = mongoose.model('don_hang');
const NguoiDung = mongoose.model('nguoi_dung');
const SanPham = mongoose.model('san_pham');
const Voucher = mongoose.model('voucher');

// ======================================================
// 1. Lấy danh sách tất cả đơn hàng (có phân trang, tìm kiếm, lọc)
// GET /api/admin/order
// Yêu cầu: Token hợp lệ, vai trò admin
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm tổng quát theo mã đơn hàng, email, sdt, họ tên
            trang_thai_don_hang,
            trang_thai_thanh_toan,
            startDate,
            endDate,
            id_customer,
            id_shipper
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        // Tạo điều kiện tìm kiếm tổng quát
        if (search) {
            query.$or = [
                { ma_don_hang: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { sdt: { $regex: search, $options: 'i' } },
                { ho_ten: { $regex: search, $options: 'i' } }
            ];
        }

        // Lọc theo trạng thái đơn hàng
        if (trang_thai_don_hang) {
            query.trang_thai_don_hang = trang_thai_don_hang;
        }

        // Lọc theo trạng thái thanh toán
        if (trang_thai_thanh_toan) {
            query.trang_thai_thanh_toan = trang_thai_thanh_toan;
        }

        // Lọc theo khoảng thời gian tạo đơn hàng
        if (startDate || endDate) {
            query.created_at = {};
            if (startDate) {
                query.created_at.$gte = new Date(startDate);
            }
            if (endDate) {
                // Đảm bảo endDate bao gồm cả ngày cuối cùng
                let end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.created_at.$lte = end;
            }
        }

        // Lọc theo ID khách hàng
        if (id_customer && mongoose.Types.ObjectId.isValid(id_customer)) {
            query.id_customer = new mongoose.Types.ObjectId(id_customer);
        }

        // Lọc theo ID shipper
        if (id_shipper && mongoose.Types.ObjectId.isValid(id_shipper)) {
            query.id_shipper = new mongoose.Types.ObjectId(id_shipper);
        }

        const orders = await DonHang.find(query)
            .sort({ created_at: -1 }) // Sắp xếp đơn hàng mới nhất lên đầu
            .skip(skip)
            .limit(parseInt(limit))
            .populate('id_customer', 'ho_ten email sdt avatar') // Lấy thông tin khách hàng
            .populate('id_shipper', 'ho_ten email sdt avatar') // Lấy thông tin shipper
            .populate({
                path: 'id_voucher', // Lấy thông tin voucher
                select: 'code discount_type discount_value min_order_value start_date end_date is_active' // Các trường bạn muốn từ voucher
            })
            .lean(); // Chuyển kết quả sang plain JavaScript object để dễ thao tác

        // Populate thông tin sản phẩm (ten_sp, slug, hinh_chinh) cho từng variant trong chi_tiet
        // Vì id_variant trong chi_tiet là _id của sub-document variant,
        // chúng ta cần truy vấn SanPham model để lấy chi tiết sản phẩm và variant
        for (const order of orders) {
            for (let i = 0; i < order.chi_tiet.length; i++) {
                const item = order.chi_tiet[i];
                if (item.id_variant) {
                    const product = await SanPham.findOne({ 'variants._id': item.id_variant });
                    if (product) {
                        const variant = product.variants.id(item.id_variant);
                        if (variant) {
                            // Gán các trường của variant và thêm ten_sp, slug từ product cha
                            order.chi_tiet[i].id_variant = {
                                _id: variant._id,
                                sku: variant.sku,
                                kich_thuoc: variant.kich_thuoc,
                                mau_sac: variant.mau_sac,
                                gia: variant.gia,
                                gia_km: variant.gia_km,
                                hinh_chinh: variant.hinh_chinh,
                                ten_sp: product.ten_sp, // Thêm ten_sp từ sản phẩm cha
                                slug: product.slug // Thêm slug từ sản phẩm cha
                            };
                        } else {
                            // Nếu variant không tìm thấy, có thể xóa hoặc gán null để tránh lỗi
                            order.chi_tiet[i].id_variant = null;
                        }
                    } else {
                        // Nếu sản phẩm không tìm thấy, có thể xóa hoặc gán null
                        order.chi_tiet[i].id_variant = null;
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
        console.error('Lỗi khi lấy danh sách đơn hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách đơn hàng.', error: error.message });
    }
});

// ======================================================
// 2. Lấy chi tiết một đơn hàng
// GET /api/admin/order/:id
// Yêu cầu: Token hợp lệ, vai trò admin
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
            .populate('id_voucher', 'code discount_type discount_value min_order_value start_date end_date is_active')
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
        }

        // Populate thông tin sản phẩm (ten_sp, slug, hinh_chinh) cho từng variant trong chi_tiet
        for (let i = 0; i < order.chi_tiet.length; i++) {
            const item = order.chi_tiet[i];
            if (item.id_variant) {
                const product = await SanPham.findOne({ 'variants._id': item.id_variant });
                if (product) {
                    const variant = product.variants.id(item.id_variant);
                    if (variant) {
                        order.chi_tiet[i].id_variant = {
                            _id: variant._id,
                            sku: variant.sku,
                            kich_thuoc: variant.kich_thuoc,
                            mau_sac: variant.mau_sac,
                            gia: variant.gia,
                            gia_km: variant.gia_km,
                            hinh_chinh: variant.hinh_chinh,
                            ten_sp: product.ten_sp,
                            slug: product.slug
                        };
                    } else {
                        order.chi_tiet[i].id_variant = null;
                    }
                } else {
                    order.chi_tiet[i].id_variant = null;
                }
            }
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('Lỗi khi lấy chi tiết đơn hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy chi tiết đơn hàng.', error: error.message });
    }
});

// ======================================================
// 3. Cập nhật trạng thái đơn hàng và gán shipper
// PUT /api/admin/order/:id/status
// Yêu cầu: Token hợp lệ, vai trò admin
// ======================================================
router.put('/:id/status', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { trang_thai_don_hang, trang_thai_thanh_toan, id_shipper } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
        }

        const updateFields = { updated_at: Date.now() };

        if (trang_thai_don_hang) {
            // Lấy enum từ schema để kiểm tra tính hợp lệ
            const validOrderStatuses = DonHang.schema.path('trang_thai_don_hang').caster.enum;
            if (!validOrderStatuses.includes(trang_thai_don_hang)) {
                return res.status(400).json({ success: false, message: `Trạng thái đơn hàng không hợp lệ. Các trạng thái hợp lệ là: ${validOrderStatuses.join(', ')}` });
            }
            updateFields.trang_thai_don_hang = trang_thai_don_hang;
        }

        if (trang_thai_thanh_toan) {
            const validPaymentStatuses = DonHang.schema.path('trang_thai_thanh_toan').caster.enum;
            if (!validPaymentStatuses.includes(trang_thai_thanh_toan)) {
                return res.status(400).json({ success: false, message: `Trạng thái thanh toán không hợp lệ. Các trạng thái hợp lệ là: ${validPaymentStatuses.join(', ')}` });
            }
            updateFields.trang_thai_thanh_toan = trang_thai_thanh_toan;
        }

        if (id_shipper !== undefined) { // Cho phép gán null để bỏ gán shipper
            if (id_shipper !== null) {
                if (!mongoose.Types.ObjectId.isValid(id_shipper)) {
                    return res.status(400).json({ success: false, message: 'ID shipper không hợp lệ.' });
                }
                // Tùy chọn: Kiểm tra xem ID shipper có tồn tại và có vai trò 'shipper' không
                const shipperExists = await NguoiDung.findOne({ _id: id_shipper, vai_tro: 'shipper' }).session(session);
                if (!shipperExists) {
                    return res.status(400).json({ success: false, message: 'Shipper không tồn tại hoặc không có vai trò hợp lệ.' });
                }
            }
            updateFields.id_shipper = id_shipper;
        }

        const updatedOrder = await DonHang.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, session } // Trả về tài liệu đã cập nhật và sử dụng session
        );

        if (!updatedOrder) {
            throw new Error('Không tìm thấy đơn hàng để cập nhật trạng thái.');
        }

        await session.commitTransaction();
        session.endSession();

        // Populate lại sau khi commit để đảm bảo dữ liệu mới nhất
        const finalOrder = await DonHang.findById(updatedOrder._id)
            .populate('id_customer', 'ho_ten email sdt avatar')
            .populate('id_shipper', 'ho_ten email sdt avatar')
            .populate('id_voucher', 'code discount_type value min_order_value start_date end_date is_active')
            .lean();

        // Populate thông tin sản phẩm (ten_sp, slug, hinh_chinh) cho từng variant sau khi cập nhật
        for (let i = 0; i < finalOrder.chi_tiet.length; i++) {
            const item = finalOrder.chi_tiet[i];
            if (item.id_variant) {
                const product = await SanPham.findOne({ 'variants._id': item.id_variant });
                if (product) {
                    const variant = product.variants.id(item.id_variant);
                    if (variant) {
                        finalOrder.chi_tiet[i].id_variant = {
                            _id: variant._id,
                            sku: variant.sku,
                            kich_thuoc: variant.kich_thuoc,
                            mau_sac: variant.mau_sac,
                            gia: variant.gia,
                            gia_km: variant.gia_km,
                            hinh_chinh: variant.hinh_chinh,
                            ten_sp: product.ten_sp,
                            slug: product.slug
                        };
                    } else {
                        finalOrder.chi_tiet[i].id_variant = null;
                    }
                } else {
                    finalOrder.chi_tiet[i].id_variant = null;
                }
            }
        }

        req.io.emit('orderStatusUpdated', finalOrder); // Emit qua Socket.io

        res.status(200).json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công.', data: finalOrder });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi cập nhật trạng thái đơn hàng.' });
    }
});

// ======================================================
// 4. Hủy đơn hàng
// PATCH /api/admin/order/:id/cancel
// Yêu cầu: Token hợp lệ, vai trò admin
// ======================================================
router.patch('/:id/cancel', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error('ID đơn hàng không hợp lệ.');
        }

        const order = await DonHang.findById(id).session(session);

        if (!order) {
            throw new Error('Không tìm thấy đơn hàng.');
        }

        // Chỉ cho phép hủy nếu đơn hàng đang ở trạng thái 'Chờ xác nhận' hoặc 'Đã xác nhận'
        if (order.trang_thai_don_hang !== 'Chờ xác nhận' && order.trang_thai_don_hang !== 'Đã xác nhận') {
            throw new Error(`Không thể hủy đơn hàng ở trạng thái hiện tại: ${order.trang_thai_don_hang}.`);
        }

        order.trang_thai_don_hang = 'Hủy đơn hàng';
        order.updated_at = Date.now();
        await order.save({ session });

        // Hoàn trả số lượng sản phẩm vào kho
        for (const item of order.chi_tiet) {
            const product = await SanPham.findOne({ 'variants._id': item.id_variant }).session(session);
            if (product) {
                const variant = product.variants.id(item.id_variant);
                if (variant) {
                    variant.so_luong += item.so_luong; // Tăng lại số lượng tồn kho
                    // Có thể giảm so_luong_da_ban nếu bạn muốn, tùy theo logic nghiệp vụ
                    await product.save({ session });
                }
            }
        }

        // Kích hoạt lại voucher nếu có và nếu nó đã bị vô hiệu hóa bởi đơn hàng này
        if (order.id_voucher) {
            const voucher = await Voucher.findById(order.id_voucher).session(session);
            // Kiểm tra xem voucher có tồn tại và đang không hoạt động (đã bị sử dụng)
            if (voucher && !voucher.is_active) {
                voucher.is_active = true;
                await voucher.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        // Lấy đơn hàng đã cập nhật để gửi qua socket
        const updatedOrder = await DonHang.findById(id)
            .populate('id_customer', 'ho_ten email sdt avatar')
            .populate('id_shipper', 'ho_ten email sdt avatar')
            .populate('id_voucher', 'code discount_type value min_order_value start_date end_date is_active')
            .lean();

        // Populate thông tin sản phẩm (ten_sp, slug, hinh_chinh) cho từng variant sau khi hủy
        for (let i = 0; i < updatedOrder.chi_tiet.length; i++) {
            const item = updatedOrder.chi_tiet[i];
            if (item.id_variant) {
                const product = await SanPham.findOne({ 'variants._id': item.id_variant });
                if (product) {
                    const variant = product.variants.id(item.id_variant);
                    if (variant) {
                        updatedOrder.chi_tiet[i].id_variant = {
                            _id: variant._id,
                            sku: variant.sku,
                            kich_thuoc: variant.kich_thuoc,
                            mau_sac: variant.mau_sac,
                            gia: variant.gia,
                            gia_km: variant.gia_km,
                            hinh_chinh: variant.hinh_chinh,
                            ten_sp: product.ten_sp,
                            slug: product.slug
                        };
                    } else {
                        updatedOrder.chi_tiet[i].id_variant = null;
                    }
                } else {
                    updatedOrder.chi_tiet[i].id_variant = null;
                }
            }
        }

        req.io.emit('orderCancelled', updatedOrder);

        res.status(200).json({ success: true, message: 'Đơn hàng đã được hủy thành công và sản phẩm đã được hoàn trả.', data: updatedOrder });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Lỗi khi hủy đơn hàng:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi hủy đơn hàng.' });
    }
});

// ======================================================
// 5. Xóa đơn hàng (Cẩn trọng khi sử dụng trong production)
// DELETE /api/admin/order/:id
// Yêu cầu: Token hợp lệ, vai trò admin
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
        console.error('Lỗi khi xóa đơn hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa đơn hàng.', error: error.message });
    }
});

// ======================================================
// 6. Thống kê đơn hàng (Tổng quan)
// GET /api/admin/order/statistics
// Yêu cầu: Token hợp lệ, vai trò admin
// ======================================================
router.get('/statistics', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = {};

        if (startDate || endDate) {
            query.created_at = {};
            if (startDate) {
                query.created_at.$gte = new Date(startDate);
            }
            if (endDate) {
                let end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.created_at.$lte = end;
            }
        }

        const totalOrders = await DonHang.countDocuments(query);
        const ordersByStatus = await DonHang.aggregate([
            { $match: query },
            { $group: { _id: '$trang_thai_don_hang', count: { $sum: 1 } } }
        ]);

        const totalRevenue = await DonHang.aggregate([
            {
                $match: {
                    ...query,
                    trang_thai_thanh_toan: 'Đã thanh toán',
                    trang_thai_don_hang: { $in: ['Đã giao', 'Giao hàng thành công'] }
                }
            },
            { $group: { _id: null, total: { $sum: '$tong_tien' } } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalOrders,
                ordersByStatus,
                totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
            }
        });

    } catch (error) {
        console.error('Lỗi khi lấy thống kê đơn hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy thống kê đơn hàng.', error: error.message });
    }
});

module.exports = router;