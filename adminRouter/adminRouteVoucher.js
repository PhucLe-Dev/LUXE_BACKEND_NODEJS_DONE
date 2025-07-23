const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const Voucher = mongoose.model('voucher');

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
            max_discount_value, // Thêm giới hạn giảm giá tối đa
            min_order_value,
            start_date,
            end_date,
            is_active = true
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
            is_active
        });

        const savedVoucher = await newVoucher.save();
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

        const voucher = await Voucher.findById(id).lean();
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

        // Không cho phép cập nhật mã 'code'
        const { code, ...updateData } = req.body;

        const updatedVoucher = await Voucher.findByIdAndUpdate(id, updateData, { new: true });
        if (!updatedVoucher) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy voucher để cập nhật.' });
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


module.exports = router;
