const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const ThuongHieu = mongoose.model('thuong_hieu'); // Đảm bảo model 'thuong_hieu' đã được định nghĩa
const SanPham = mongoose.model('san_pham'); // Import để kiểm tra sản phẩm liên quan

// ======================================================
// 1. Lấy danh sách Thương hiệu (có phân trang, tìm kiếm)
// GET /api/admin/brands
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm theo tên thương hiệu
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (search) {
            query.ten_thuong_hieu = { $regex: search, $options: 'i' };
        }

        const brands = await ThuongHieu.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalItems = await ThuongHieu.countDocuments(query);
        const totalPages = Math.ceil(totalItems / parseInt(limit));

        res.status(200).json({
            success: true,
            data: brands,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalItems,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách thương hiệu:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 2. Thêm Thương hiệu mới
// POST /api/admin/brands
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { ten_thuong_hieu, mo_ta, hinh, an_hien, slug } = req.body;

        if (!ten_thuong_hieu) {
            return res.status(400).json({ success: false, message: 'Tên thương hiệu là bắt buộc.' });
        }

        // Tự động tạo ID tăng dần (tương tự như với danh mục)
        const lastItem = await ThuongHieu.findOne().sort({ id: -1 });
        const newId = lastItem ? lastItem.id + 1 : 1;

        const newBrand = new ThuongHieu({
            id: newId,
            ten_thuong_hieu,
            mo_ta,
            hinh,
            slug: slug || ten_thuong_hieu.toLowerCase().replace(/ /g, '-'),
            an_hien: an_hien !== undefined ? an_hien : true,
        });

        const savedBrand = await newBrand.save();
        res.status(201).json({ success: true, message: 'Tạo thương hiệu thành công.', data: savedBrand });

    } catch (error) {
        console.error("Lỗi khi thêm thương hiệu:", error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Tên thương hiệu đã tồn tại.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một Thương hiệu
// GET /api/admin/brands/:id (sử dụng _id của MongoDB)
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const brand = await ThuongHieu.findById(req.params.id).lean();
        if (!brand) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu.' });
        }
        res.status(200).json({ success: true, data: brand });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 4. Cập nhật một Thương hiệu
// PUT /api/admin/brands/:id (sử dụng _id của MongoDB)
// ======================================================
router.put('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const updatedBrand = await ThuongHieu.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedBrand) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu để cập nhật.' });
        }
        res.status(200).json({ success: true, message: 'Cập nhật thương hiệu thành công.', data: updatedBrand });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 5. Xóa một Thương hiệu
// DELETE /api/admin/brands/:id (sử dụng _id của MongoDB)
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const brandToDelete = await ThuongHieu.findById(req.params.id);
        if (!brandToDelete) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu.' });
        }

        // Kiểm tra xem có sản phẩm nào thuộc thương hiệu này không
        const productsInBrand = await SanPham.countDocuments({ id_thuong_hieu: brandToDelete.id });
        if (productsInBrand > 0) {
            return res.status(400).json({ success: false, message: `Không thể xóa vì có ${productsInBrand} sản phẩm thuộc thương hiệu này.` });
        }

        await ThuongHieu.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Xóa thương hiệu thành công.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 6. Lấy tất cả thương hiệu (cho dropdown)
// GET /api/admin/brands/all
// ======================================================
router.get('/all', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const allBrands = await ThuongHieu.find({ an_hien: true }).select('id ten_thuong_hieu').sort({ ten_thuong_hieu: 1 });
        res.status(200).json({ success: true, data: allBrands });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

module.exports = router;