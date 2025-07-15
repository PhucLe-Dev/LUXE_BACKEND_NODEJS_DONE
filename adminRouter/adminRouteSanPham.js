const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const SanPham = mongoose.model('san_pham'); // Model Sản phẩm
const LoaiSanPham = mongoose.model('loai_san_pham'); // Model Loại Sản phẩm
const ThuongHieu = mongoose.model('thuong_hieu'); // Model Thương Hiệu

// ======================================================
// 1. Lấy danh sách Sản phẩm (có phân trang, tìm kiếm, lọc)
// GET /api/admin/products
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm theo tên sản phẩm (ten_sp)
            id_loai, // Lọc theo ID loại sản phẩm
            id_thuong_hieu, // Lọc theo ID thương hiệu
            an_hien, // Lọc theo trạng thái ẩn/hiện
            hot // Lọc theo sản phẩm hot
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (search) {
            query.ten_sp = { $regex: search, $options: 'i' }; // Tìm kiếm theo ten_sp
        }
        if (id_loai) {
            query.id_loai = parseInt(id_loai);
        }
        if (id_thuong_hieu) { // Thêm điều kiện lọc
            query.id_thuong_hieu = parseInt(id_thuong_hieu);
        }
        if (an_hien !== undefined) {
            query.an_hien = an_hien === 'true'; // Chuyển đổi chuỗi 'true'/'false' sang boolean
        }
        if (hot !== undefined) {
            query.hot = hot === 'true'; // Chuyển đổi chuỗi 'true'/'false' sang boolean
        }

        const products = await SanPham.find(query)
            .populate('id_loai', 'ten_loai') // Lấy tên loại sản phẩm
            .populate('id_thuong_hieu', 'ten_thuong_hieu') // Lấy tên thương hiệu
            .sort({ created_at: -1 }) // Sắp xếp theo thời gian tạo mới nhất
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // lean() để trả về plain JavaScript objects thay vì Mongoose documents

        const totalItems = await SanPham.countDocuments(query);
        const totalPages = Math.ceil(totalItems / parseInt(limit));

        res.status(200).json({
            success: true,
            data: products,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalItems,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 2. Thêm Sản phẩm mới
// POST /api/admin/products
// LƯU Ý: Khi thêm sản phẩm mới, ít nhất một biến thể (variant) phải được cung cấp
// để sản phẩm là hợp lệ. Việc kiểm tra và quản lý SKU sẽ được thực hiện chặt chẽ hơn
// ở route variants riêng.
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            ten_sp,
            mo_ta,
            chat_lieu,
            xuat_xu,
            id_loai,
            id_thuong_hieu,
            variants, // Vẫn nhận variants ở đây
            hinh_anh,
            hot,
            an_hien,
            tags,
            meta_title,
            meta_description,
            meta_keywords
        } = req.body;

        if (!ten_sp || !id_loai || !variants || variants.length === 0) {
            return res.status(400).json({ success: false, message: 'Tên sản phẩm, loại sản phẩm và ít nhất một biến thể là bắt buộc.' });
        }

        // Kiểm tra tồn tại của id_loai
        const loaiSanPhamExists = await LoaiSanPham.findOne({ id: id_loai });
        if (!loaiSanPhamExists) {
            return res.status(400).json({ success: false, message: 'ID loại sản phẩm không hợp lệ.' });
        }

        // Kiểm tra tồn tại của id_thuong_hieu nếu có
        if (id_thuong_hieu) {
            const thuongHieuExists = await ThuongHieu.findOne({ id: id_thuong_hieu });
            if (!thuongHieuExists) {
                return res.status(400).json({ success: false, message: 'ID thương hiệu không hợp lệ.' });
            }
        }

        // Tự động tạo ID tăng dần (giống như LoaiSanPham)
        const lastProduct = await SanPham.findOne().sort({ id: -1 });
        const newProductId = lastProduct ? lastProduct.id + 1 : 1;

        // Các kiểm tra SKU chi tiết và giá/km sẽ được thực hiện khi thao tác với variants riêng lẻ
        // hoặc trong một bước validate riêng nếu bạn muốn chặt chẽ hơn ở đây.
        // Hiện tại, giả định dữ liệu variants đầu vào cơ bản là hợp lệ.
        for (const variant of variants) {
            if (variant.gia < 0 || (variant.gia_km !== null && variant.gia_km < 0)) {
                return res.status(400).json({ success: false, message: 'Giá và giá khuyến mãi của biến thể không được âm.' });
            }
            if (variant.gia_km !== null && variant.gia_km > 0 && variant.gia > 0) {
                variant.phan_tram_km = Math.round(((variant.gia - variant.gia_km) / variant.gia) * 100);
            } else {
                variant.phan_tram_km = 0;
            }
        }

        const newProduct = new SanPham({
            id: newProductId,
            ten_sp,
            mo_ta,
            chat_lieu,
            xuat_xu,
            id_loai,
            id_thuong_hieu,
            variants, // Lưu variants kèm theo sản phẩm
            hinh_anh,
            hot: hot !== undefined ? hot : false,
            an_hien: an_hien !== undefined ? an_hien : true,
            tags,
            meta_title,
            meta_description,
            meta_keywords,
        });

        const savedProduct = await newProduct.save();
        res.status(201).json({ success: true, message: 'Tạo sản phẩm thành công.', data: savedProduct });

    } catch (error) {
        console.error("Lỗi khi thêm sản phẩm:", error);
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.slug) {
                return res.status(400).json({ success: false, message: 'Tên sản phẩm (slug) đã tồn tại.' });
            }
            if (error.keyPattern && error.keyPattern.id) {
                return res.status(400).json({ success: false, message: 'ID sản phẩm đã tồn tại (lỗi hệ thống). Vui lòng thử lại.' });
            }
            // Loại bỏ kiểm tra SKU ở đây, sẽ do router variants xử lý khi thêm/cập nhật riêng lẻ
            // if (error.keyPattern && error.keyPattern['variants.sku']) {
            //     return res.status(400).json({ success: false, message: 'Một SKU trong các biến thể đã tồn tại.' });
            // }
            return res.status(400).json({ success: false, message: 'Dữ liệu đã tồn tại hoặc không hợp lệ.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một Sản phẩm
// GET /api/admin/products/:id
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await SanPham.findOne({ id: id })
            .populate('id_loai', 'ten_loai')
            .populate('id_thuong_hieu', 'ten_thuong_hieu')
            .lean();

        if (!product) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
        }

        res.status(200).json({ success: true, data: product });

    } catch (error) {
        console.error("Lỗi khi lấy chi tiết sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 4. Cập nhật một Sản phẩm (không bao gồm variants chi tiết)
// PUT /api/admin/products/:id
// ======================================================
router.put('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            ten_sp,
            mo_ta,
            chat_lieu,
            xuat_xu,
            id_loai,
            id_thuong_hieu,
            // variants, // Bỏ variants khỏi đây, chỉ cập nhật thông tin chung của sản phẩm
            hinh_anh,
            hot,
            an_hien,
            tags,
            meta_title,
            meta_description,
            meta_keywords
        } = req.body;

        // Kiểm tra tồn tại của id_loai nếu được cung cấp
        if (id_loai) {
            const loaiSanPhamExists = await LoaiSanPham.findOne({ id: id_loai });
            if (!loaiSanPhamExists) {
                return res.status(400).json({ success: false, message: 'ID loại sản phẩm không hợp lệ.' });
            }
        }

        // Kiểm tra tồn tại của id_thuong_hieu nếu được cung cấp
        if (id_thuong_hieu) {
            const thuongHieuExists = await ThuongHieu.findOne({ id: id_thuong_hieu });
            if (!thuongHieuExists) {
                return res.status(400).json({ success: false, message: 'ID thương hiệu không hợp lệ.' });
            }
        }

        const updateData = {
            ten_sp,
            mo_ta,
            chat_lieu,
            xuat_xu,
            id_loai,
            id_thuong_hieu,
            hinh_anh,
            hot,
            an_hien,
            tags,
            meta_title,
            meta_description,
            meta_keywords,
            updated_at: Date.now()
        };

        // Bỏ qua phần xử lý variants phức tạp ở đây.
        // Nếu muốn cập nhật variants, phải dùng API riêng của variants.

        const updatedProduct = await SanPham.findOneAndUpdate({ id: id }, updateData, { new: true, runValidators: true });

        if (!updatedProduct) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm để cập nhật.' });
        }

        res.status(200).json({ success: true, message: 'Cập nhật sản phẩm thành công.', data: updatedProduct });

    } catch (error) {
        console.error("Lỗi khi cập nhật sản phẩm:", error);
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.slug) {
                return res.status(400).json({ success: false, message: 'Tên sản phẩm (slug) đã tồn tại.' });
            }
            return res.status(400).json({ success: false, message: 'Dữ liệu đã tồn tại hoặc không hợp lệ.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});



// ======================================================
// 5. Xóa một Sản phẩm
// DELETE /api/admin/products/:id
// ======================================================
router.delete('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const deletedProduct = await SanPham.findOneAndDelete({ id: id });
        if (!deletedProduct) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm để xóa.' });
        }

        res.status(200).json({ success: true, message: 'Xóa sản phẩm thành công.' });

    } catch (error) {
        console.error("Lỗi khi xóa sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

// ======================================================
// 6. Lấy tất cả sản phẩm (cho dropdown, không phân trang)
// GET /api/admin/products/all
// ======================================================
router.get('/all', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const allProducts = await SanPham.find({}).select('id ten_sp').sort({ ten_sp: 1 }).lean();
        res.status(200).json({ success: true, data: allProducts });
    } catch (error) {
        console.error("Lỗi khi lấy tất cả sản phẩm:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

module.exports = router;