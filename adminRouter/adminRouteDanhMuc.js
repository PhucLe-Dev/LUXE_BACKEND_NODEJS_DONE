const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const LoaiSanPham = mongoose.model('loai_san_pham');
const SanPham = mongoose.model('san_pham'); // Import để kiểm tra sản phẩm tồn tại

// ======================================================
// 1. Lấy danh sách Loại sản phẩm (có phân trang, tìm kiếm)
// GET /api/admin/product-types
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm theo tên loại
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (search) {
            query.ten_loai = { $regex: search, $options: 'i' };
        }

        const productTypes = await LoaiSanPham.find(query)
            .sort({ thu_tu: 1, created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalItems = await LoaiSanPham.countDocuments(query);
        const totalPages = Math.ceil(totalItems / parseInt(limit));

        res.status(200).json({
            success: true,
            data: productTypes,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalItems,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách loại sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 2. Thêm Loại sản phẩm mới
// POST /api/admin/product-types
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { ten_loai, mo_ta, hinh, thu_tu, an_hien } = req.body;

        if (!ten_loai) {
            return res.status(400).json({ success: false, message: 'Tên loại sản phẩm là bắt buộc.' });
        }

        // Tự động tạo ID tăng dần
        const lastItem = await LoaiSanPham.findOne().sort({ id: -1 });
        const newId = lastItem ? lastItem.id + 1 : 1;

        const newProductType = new LoaiSanPham({
            id: newId,
            ten_loai,
            mo_ta,
            hinh,
            thu_tu: thu_tu || 0,
            an_hien: an_hien !== undefined ? an_hien : true,
        });

        const savedProductType = await newProductType.save();
        res.status(201).json({ success: true, message: 'Tạo loại sản phẩm thành công.', data: savedProductType });

    } catch (error) {
        console.error("Lỗi khi thêm loại sản phẩm:", error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Tên loại sản phẩm đã tồn tại.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một Loại sản phẩm
// GET /api/admin/product-types/:id
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const productType = await LoaiSanPham.findOne({ id: id }).lean();

        if (!productType) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy loại sản phẩm.' });
        }

        res.status(200).json({ success: true, data: productType });

    } catch (error) {
        console.error("Lỗi khi lấy chi tiết loại sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 4. Cập nhật một Loại sản phẩm
// PUT /api/admin/product-types/:id
// ======================================================
router.put('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_loai, mo_ta, hinh, thu_tu, an_hien } = req.body;

        const updateData = { ten_loai, mo_ta, hinh, thu_tu, an_hien, updated_at: Date.now() };

        const updatedProductType = await LoaiSanPham.findOneAndUpdate({ id: id }, updateData, { new: true });

        if (!updatedProductType) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy loại sản phẩm để cập nhật.' });
        }

        res.status(200).json({ success: true, message: 'Cập nhật loại sản phẩm thành công.', data: updatedProductType });

    } catch (error) {
        console.error("Lỗi khi cập nhật loại sản phẩm:", error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Tên loại sản phẩm đã tồn tại.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});



// ======================================================
// 5. Xóa một Loại sản phẩm
// DELETE /api/admin/product-types/:id
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Kiểm tra xem có sản phẩm nào thuộc danh mục này không
        const productsInCategory = await SanPham.countDocuments({ id_loai: id });
        if (productsInCategory > 0) {
            return res.status(400).json({ success: false, message: `Không thể xóa vì có ${productsInCategory} sản phẩm đang thuộc loại này.` });
        }

        const deletedProductType = await LoaiSanPham.findOneAndDelete({ id: id });
        if (!deletedProductType) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy loại sản phẩm để xóa.' });
        }

        res.status(200).json({ success: true, message: 'Xóa loại sản phẩm thành công.' });

    } catch (error) {
        console.error("Lỗi khi xóa loại sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});



// 6. Lấy tất cả danh mục (cho dropdown)
// GET /api/admin/categories/all
// ======================================================
router.get('/all', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const allCategories = await LoaiSanPham.find({}).select('id ten_loai').sort({ ten_loai: 1 });
        res.status(200).json({ success: true, data: allCategories });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

module.exports = router;
