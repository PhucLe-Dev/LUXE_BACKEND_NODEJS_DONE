const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const Voucher = mongoose.model('voucher');
const NguoiDung = mongoose.model('nguoi_dung');

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'cuahangluxe@gmail.com',
        pass: process.env.EMAIL_PASS || 'fuph ggix gudv cowh'
    }
});

// ======================================================
// 1. Lấy danh sách Voucher (có phân trang, tìm kiếm, lọc)
// GET /api/admin/vouchers
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm theo mã voucher
            discount_type = '', // Lọc theo loại giảm giá
            status = '' // Lọc theo trạng thái: active, inactive, expired
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        // Xử lý tìm kiếm
        if (search) {
            query.code = { $regex: search, $options: 'i' };
        }

        // Xử lý lọc theo loại giảm giá
        if (discount_type) {
            query.discount_type = discount_type;
        }

        // Xử lý lọc theo trạng thái
        const now = new Date();
        if (status === 'active') {
            query.is_active = true;
            query.start_date = { $lte: now };
            query.end_date = { $gte: now };
        } else if (status === 'inactive') {
            query.is_active = false;
        } else if (status === 'expired') {
            query.end_date = { $lt: now };
        }

        const vouchers = await Voucher.find(query)
            .populate('id_customer', 'ho_ten email')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalVouchers = await Voucher.countDocuments(query);
        const totalPages = Math.ceil(totalVouchers / parseInt(limit));

        res.status(200).json({
            success: true,
            data: vouchers,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalVouchers,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách voucher:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách voucher.' });
    }
});

// ======================================================
// 1.1. Lấy danh sách người dùng (để chọn khi tặng voucher)
// GET /api/admin/vouchers/users
// ======================================================
router.get('/users/list', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { search = '', limit = 50 } = req.query;
        const query = { vai_tro: 'khach_hang' };

        if (search) {
            query.$or = [
                { ho_ten: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await NguoiDung.find(query)
            .select('ho_ten email')
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách người dùng:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách người dùng.' });
    }
});

// ======================================================
// 2. Thêm Voucher mới
// POST /api/admin/vouchers
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            code,
            description,
            discount_type,
            discount_value,
            max_discount_value,
            min_order_value,
            start_date,
            end_date,
            is_active = true,
            id_customer
        } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!code || !discount_type || !discount_value || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ thông tin bắt buộc.' });
        }

        // Kiểm tra mã voucher đã tồn tại chưa
        const existingVoucher = await Voucher.findOne({ code: code.toUpperCase() });
        if (existingVoucher) {
            return res.status(400).json({ success: false, message: 'Mã voucher này đã tồn tại.' });
        }

        const newVoucher = new Voucher({
            code: code.toUpperCase(),
            description,
            discount_type,
            discount_value,
            max_discount_value,
            min_order_value,
            start_date,
            end_date,
            is_active,
            id_customer: id_customer && mongoose.Types.ObjectId.isValid(id_customer) ? id_customer : null
        });

        const savedVoucher = await newVoucher.save();

        // Gửi email thông báo nếu voucher được tặng cho khách hàng cụ thể
        if (id_customer) {
            await sendVoucherEmail(id_customer, savedVoucher, 'new');
        }

        res.status(201).json({ success: true, message: 'Tạo voucher thành công.', data: savedVoucher });

    } catch (error) {
        console.error("Lỗi khi thêm voucher:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm voucher.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một Voucher
// GET /api/admin/vouchers/:id
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID voucher không hợp lệ.' });
        }

        const voucher = await Voucher.findById(id)
            .populate('id_customer', 'ho_ten email')
            .lean();
        
        if (!voucher) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy voucher.' });
        }

        res.status(200).json({ success: true, data: voucher });

    } catch (error) {
        console.error("Lỗi khi lấy chi tiết voucher:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 4. Cập nhật một Voucher
// PUT /api/admin/vouchers/:id
// ======================================================
router.put('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID voucher không hợp lệ.' });
        }

        // Lấy voucher hiện tại để so sánh
        const currentVoucher = await Voucher.findById(id);
        if (!currentVoucher) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy voucher để cập nhật.' });
        }

        // Không cho phép cập nhật mã 'code'
        const { code, ...updateData } = req.body;

        // Xử lý id_customer
        if (updateData.id_customer === '') {
            updateData.id_customer = null;
        } else if (updateData.id_customer && !mongoose.Types.ObjectId.isValid(updateData.id_customer)) {
            return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ.' });
        }

        const updatedVoucher = await Voucher.findByIdAndUpdate(id, updateData, { new: true })
            .populate('id_customer', 'ho_ten email');

        // Gửi email nếu voucher được gán cho khách hàng mới
        const oldCustomerId = currentVoucher.id_customer?.toString();
        const newCustomerId = updatedVoucher.id_customer?._id?.toString();

        if (newCustomerId && oldCustomerId !== newCustomerId) {
            await sendVoucherEmail(newCustomerId, updatedVoucher, 'assigned');
        }

        res.status(200).json({ success: true, message: 'Cập nhật voucher thành công.', data: updatedVoucher });

    } catch (error) {
        console.error("Lỗi khi cập nhật voucher:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 5. Xóa một Voucher
// DELETE /api/admin/vouchers/:id
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID voucher không hợp lệ.' });
        }

        const deletedVoucher = await Voucher.findByIdAndDelete(id);
        if (!deletedVoucher) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy voucher để xóa.' });
        }

        res.status(200).json({ success: true, message: 'Xóa voucher thành công.' });

    } catch (error) {
        console.error("Lỗi khi xóa voucher:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// Hàm gửi email thông báo voucher
// ======================================================
async function sendVoucherEmail(customerId, voucher, type) {
    try {
        const customer = await NguoiDung.findById(customerId);
        if (!customer || !customer.email) {
            console.log('Không tìm thấy thông tin email khách hàng');
            return;
        }

        const discountText = voucher.discount_type === 'percent' 
            ? `${voucher.discount_value}%`
            : `${voucher.discount_value.toLocaleString('vi-VN')} VNĐ`;

        const maxDiscountText = voucher.max_discount_value 
            ? `(tối đa ${voucher.max_discount_value.toLocaleString('vi-VN')} VNĐ)`
            : '';

        const minOrderText = voucher.min_order_value 
            ? `Áp dụng cho đơn hàng từ ${voucher.min_order_value.toLocaleString('vi-VN')} VNĐ`
            : 'Không giới hạn giá trị đơn hàng';

        const subject = type === 'new' ? 'Bạn đã nhận được voucher mới!' : 'Bạn đã được tặng voucher!';

        const mailOptions = {
            from: process.env.EMAIL_USER || 'cuahangluxe@gmail.com',
            to: customer.email,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #333; text-align: center;">🎉 Chúc mừng ${customer.ho_ten}!</h2>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #007bff; margin-top: 0;">Thông tin voucher:</h3>
                        <p><strong>Mã voucher:</strong> <span style="color: #dc3545; font-size: 18px; font-weight: bold;">${voucher.code}</span></p>
                        <p><strong>Mô tả:</strong> ${voucher.description || 'Không có mô tả'}</p>
                        <p><strong>Giá trị giảm:</strong> ${discountText} ${maxDiscountText}</p>
                        <p><strong>Điều kiện:</strong> ${minOrderText}</p>
                        <p><strong>Thời gian áp dụng:</strong> ${new Date(voucher.start_date).toLocaleDateString('vi-VN')} - ${new Date(voucher.end_date).toLocaleDateString('vi-VN')}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 20px 0;">
                        <p style="color: #666;">Hãy sử dụng voucher này để tiết kiệm chi phí cho đơn hàng tiếp theo của bạn!</p>
                        <p style="color: #666; font-size: 14px; font-style: italic;">* Voucher này chỉ dành riêng cho bạn và không thể chuyển nhượng.</p>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    
                    <div style="text-align: center; color: #666; font-size: 14px;">
                        <p>Trân trọng,<br><strong>Cửa hàng Luxe</strong></p>
                        <p>Email: cuahangluxe@gmail.com</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Đã gửi email thông báo voucher cho ${customer.email}`);

    } catch (error) {
        console.error('Lỗi khi gửi email:', error);
    }
}

module.exports = router;