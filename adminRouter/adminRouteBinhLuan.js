const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');

const BinhLuan = mongoose.model('binh_luan');
// ======================================================
// 1. Lấy danh sách Bình luận (có phân trang, tìm kiếm, lọc)
// GET /api/admin/comments
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            id_san_pham = '',
            id_customer = '',
            diem = '',
            an_hien = '' // Có thể là 'true', 'false', hoặc ''
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        // Xử lý tìm kiếm theo nội dung
        if (search) {
            query.noi_dung = { $regex: search, $options: 'i' };
        }

        // Xử lý lọc theo ID sản phẩm
        if (id_san_pham && mongoose.Types.ObjectId.isValid(id_san_pham)) {
            query.id_san_pham = id_san_pham;
        }

        // Xử lý lọc theo ID khách hàng
        if (id_customer && mongoose.Types.ObjectId.isValid(id_customer)) {
            query.id_customer = id_customer;
        }

        // Xử lý lọc theo điểm
        if (diem) {
            const diemNum = parseInt(diem);
            if (!isNaN(diemNum) && diemNum >= 1 && diemNum <= 5) {
                query.diem = diemNum;
            }
        }

        // Xử lý lọc theo trạng thái ẩn/hiện
        if (an_hien !== '') { // Chỉ áp dụng bộ lọc nếu nó không phải là chuỗi rỗng
            query.an_hien = an_hien === 'true'; // Chuyển đổi chuỗi thành boolean
        }

        const comments = await BinhLuan.find(query)
            .populate('id_san_pham', 'ten_sp slug')
            .populate('id_customer', 'username email')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalComments = await BinhLuan.countDocuments(query);
        const totalPages = Math.ceil(totalComments / parseInt(limit));

        res.status(200).json({
            success: true,
            data: comments,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalComments,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách bình luận:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách bình luận.' });
    }
});

// ======================================================
// 2. Thêm Bình luận mới
// POST /api/admin/comments
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            id_san_pham,
            id_customer,
            parent_id = null,
            diem = null,
            noi_dung,
            an_hien = true
        } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!id_san_pham || !id_customer || !noi_dung) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ thông tin bắt buộc: id_san_pham, id_customer, noi_dung.' });
        }

        // Kiểm tra định dạng ObjectId
        if (!mongoose.Types.ObjectId.isValid(id_san_pham) || !mongoose.Types.ObjectId.isValid(id_customer)) {
            return res.status(400).json({ success: false, message: 'ID sản phẩm hoặc ID khách hàng không hợp lệ.' });
        }
        if (parent_id && !mongoose.Types.ObjectId.isValid(parent_id)) {
            return res.status(400).json({ success: false, message: 'Parent ID bình luận không hợp lệ.' });
        }

        const newComment = new BinhLuan({
            id_san_pham,
            id_customer,
            parent_id,
            diem,
            noi_dung,
            an_hien
        });

        const savedComment = await newComment.save();
        res.status(201).json({ success: true, message: 'Tạo bình luận thành công.', data: savedComment });

    } catch (error) {
        console.error("Lỗi khi thêm bình luận:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm bình luận.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một Bình luận
// GET /api/admin/comments/:id
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID bình luận không hợp lệ.' });
        }

        const comment = await BinhLuan.findById(id)
            .populate('id_san_pham', 'ten_sp slug')
            .populate('id_customer', 'username email')
            .lean();

        if (!comment) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bình luận.' });
        }

        res.status(200).json({ success: true, data: comment });

    } catch (error) {
        console.error("Lỗi khi lấy chi tiết bình luận:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 4. Cập nhật một Bình luận
// PUT /api/admin/comments/:id
// ======================================================
router.put('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID bình luận không hợp lệ.' });
        }

        const updateData = req.body;

        // Không cho phép cập nhật id_san_pham và id_customer trực tiếp qua PUT
        delete updateData.id_san_pham;
        delete updateData.id_customer;

        const updatedComment = await BinhLuan.findByIdAndUpdate(id, updateData, { new: true });
        if (!updatedComment) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bình luận để cập nhật.' });
        }

        res.status(200).json({ success: true, message: 'Cập nhật bình luận thành công.', data: updatedComment });

    } catch (error) {
        console.error("Lỗi khi cập nhật bình luận:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 5. Xóa một Bình luận
// DELETE /api/admin/comments/:id
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID bình luận không hợp lệ.' });
        }

        const deletedComment = await BinhLuan.findByIdAndDelete(id);
        if (!deletedComment) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bình luận để xóa.' });
        }

        res.status(200).json({ success: true, message: 'Xóa bình luận thành công.' });

    } catch (error) {
        console.error("Lỗi khi xóa bình luận:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});


module.exports = router;