// adminRouteSanPhamPhucDev.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các Models cần thiết
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));
const LoaiSanPhamModel = mongoose.model('loai_san_pham', require('../model/schemaLoaiSanPham'));
const ThuongHieuModel = mongoose.model('thuong_hieu', require('../model/schemaThuongHieu'));
const { makeSlug, makeSku } = require('../utils/generate'); // Đảm bảo makeSku đã được import

const calculateDiscountPercentage = (originalPrice, discountedPrice) => {
    if (originalPrice === null || originalPrice <= 0 || discountedPrice === null || discountedPrice >= originalPrice) {
        return null; // No valid discount or invalid prices
    }
    return ((originalPrice - discountedPrice) / originalPrice) * 100;
};

// ======================================================
// GET: Lấy danh sách các loại sản phẩm (categories) cho dropdown
// GET /api/admin/product/phucdev/categories/all
// ======================================================
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await LoaiSanPhamModel.find({})
            .select('id ten_loai')
            .sort({ thu_tu: 1, ten_loai: 1 });
        res.status(200).json({ success: true, data: categories });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách loại sản phẩm:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh mục.' });
    }
});

// ======================================================
// GET: Lấy danh sách các thương hiệu cho dropdown
// ======================================================
router.get('/brands/all', async (req, res) => {
    try {
        const brands = await ThuongHieuModel.find({})
            .select('id ten_thuong_hieu')
            .sort({ ten_thuong_hieu: 1 });
        res.status(200).json({ success: true, data: brands });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thương hiệu:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy thương hiệu.' });
    }
});

// ======================================================
// GET: Lấy danh sách sản phẩm với phân trang, tìm kiếm và lọc
// ======================================================
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const sortBy = req.query.sortBy || 'created_at';
        const sortOrder = req.query.sortOrder || 'desc';
        const visibility = req.query.visibility || 'all';
        const category = req.query.category || 'all';
        const brand = req.query.brand || 'all';
        const priceRange = req.query.priceRange || 'all';
        const stock = req.query.stock || 'all';

        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { ten_sp: { $regex: search, $options: 'i' } },
                    { mo_ta: { $regex: search, $options: 'i' } }
                ]
            };
        }

        if (visibility === 'visible') {
            searchQuery.an_hien = true;
        } else if (visibility === 'hidden') {
            searchQuery.an_hien = false;
        }

        if (category !== 'all') {
            searchQuery.id_loai = parseInt(category);
        }

        if (brand !== 'all') {
            searchQuery.id_thuong_hieu = parseInt(brand);
        }

        if (priceRange !== 'all') {
            const [minPrice, maxPrice] = priceRange.split('-').map(Number);
            searchQuery['variants.gia'] = {};
            if (minPrice !== undefined) {
                searchQuery['variants.gia'].$gte = minPrice;
            }
            if (maxPrice !== undefined && maxPrice !== 0) {
                searchQuery['variants.gia'].$lte = maxPrice;
            }
            if (priceRange.endsWith('-max')) {
                searchQuery['variants.gia'].$gte = minPrice;
                delete searchQuery['variants.gia'].$lte;
            }
        }

        if (stock === 'in_stock') {
            searchQuery['variants.so_luong'] = { $gt: 0 };
        } else if (stock === 'out_of_stock') {
            searchQuery['variants.so_luong'] = { $lte: 0 };
        } else if (stock === 'low_stock') {
            searchQuery['variants.so_luong'] = { $gt: 0, $lt: 10 };
        }

        let sortObject = {};
        switch (sortBy) {
            case 'name':
                sortObject = { ten_sp: sortOrder === 'asc' ? 1 : -1 };
                break;
            case 'price':
                sortObject = { 'variants.gia': sortOrder === 'asc' ? 1 : -1 };
                break;
            case 'created_at':
            default:
                sortObject = { created_at: sortOrder === 'asc' ? 1 : -1 };
                break;
        }

        const total = await SanPhamModel.countDocuments(searchQuery);
        const totalPages = Math.ceil(total / limit);

        const productsWithDetails = await SanPhamModel.aggregate([
            { $match: searchQuery },
            { $sort: sortObject },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'loai_san_pham',
                    localField: 'id_loai',
                    foreignField: 'id',
                    as: 'loai_san_pham'
                }
            },
            {
                $lookup: {
                    from: 'thuong_hieu',
                    localField: 'id_thuong_hieu',
                    foreignField: 'id',
                    as: 'thuong_hieu'
                }
            },
            {
                $addFields: {
                    ten_loai: { $arrayElemAt: ['$loai_san_pham.ten_loai', 0] },
                    ten_thuong_hieu: { $arrayElemAt: ['$thuong_hieu.ten_thuong_hieu', 0] }
                }
            },
            {
                $project: {
                    loai_san_pham: 0,
                    thuong_hieu: 0
                }
            }
        ]);

        res.json({
            products: productsWithDetails,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            error: 'Lỗi khi lấy danh sách sản phẩm',
            details: error.message
        });
    }
});

// ======================================================
// GET: Lấy chi tiết một sản phẩm
// ======================================================
router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await SanPhamModel.findOne({ slug: req.params.slug });
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ======================================================
// POST: Tạo sản phẩm mới
// ======================================================
router.post('/', async (req, res) => {
    try {
        const { ten_sp, id_loai, id_thuong_hieu, mo_ta, chat_lieu, xuat_xu, meta_title, meta_description, meta_keywords, an_hien, hot, variants } = req.body;

        if (!ten_sp || !id_loai || !id_thuong_hieu || !variants || variants.length === 0) {
            return res.status(400).json({ message: 'Thiếu thông tin bắt buộc: tên sản phẩm, loại, thương hiệu hoặc biến thể.' });
        }

        // Generate slug, passing SanPhamModel to makeSlug for uniqueness check
        const slug = await makeSlug(ten_sp, SanPhamModel);

        // Process variants: calculate phan_tram_km and GENERATE SKU
        // Use Promise.all to await all async makeSku calls for each variant
        const processedVariants = await Promise.all(variants.map(async (v) => {
            const phan_tram_km = calculateDiscountPercentage(v.gia, v.gia_km);
            // Await the makeSku function call and pass required parameters
            const variantSku = await makeSku(ten_sp, v.kich_thuoc, v.mau_sac);

            return {
                ...v,
                sku: variantSku, // Gán SKU được tạo tự động (là chuỗi sau khi await)
                phan_tram_km: phan_tram_km,
                created_at: new Date(),
                updated_at: new Date()
            };
        }));

        const newProduct = new SanPhamModel({
            ten_sp,
            slug,
            id_loai,
            id_thuong_hieu,
            mo_ta,
            chat_lieu,
            xuat_xu,
            meta_title,
            meta_description,
            meta_keywords,
            an_hien,
            hot,
            variants: processedVariants,
            created_at: new Date(),
            updated_at: new Date(),
        });

        const savedProduct = await newProduct.save();
        res.status(201).json({ success: true, message: 'Thêm sản phẩm thành công!', data: savedProduct });
    } catch (error) {
        console.error('Lỗi khi thêm sản phẩm:', error);
        if (error.code === 11000) { // Duplicate key error
            return res.status(409).json({ message: 'Lỗi trùng lặp dữ liệu (có thể là SKU hoặc Slug).', details: error.message });
        }
        res.status(500).json({ message: 'Lỗi server khi thêm sản phẩm.', details: error.message });
    }
});

// ======================================================
// PUT: Cập nhật sản phẩm
// ======================================================
router.put('/slug/:slug', async (req, res) => {
    try {
        const { ten_sp, id_loai, id_thuong_hieu, mo_ta, chat_lieu, xuat_xu, meta_title, meta_description, meta_keywords, an_hien, hot, variants } = req.body;

        if (!ten_sp || !id_loai || !id_thuong_hieu || !variants || variants.length === 0) {
            return res.status(400).json({ message: 'Thiếu thông tin bắt buộc: tên sản phẩm, loại, thương hiệu hoặc biến thể.' });
        }

        const product = await SanPhamModel.findOne({ slug: req.params.slug });
        if (!product) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
        }

        product.ten_sp = ten_sp;
        product.id_loai = id_loai;
        product.id_thuong_hieu = id_thuong_hieu;
        product.mo_ta = mo_ta;
        product.chat_lieu = chat_lieu;
        product.xuat_xu = xuat_xu;
        product.meta_title = meta_title;
        product.meta_description = meta_description;
        product.meta_keywords = meta_keywords;
        product.an_hien = an_hien;
        product.hot = hot;
        product.updated_at = new Date();

        if (product.ten_sp !== ten_sp) {
            product.slug = await makeSlug(ten_sp, SanPhamModel);
        }

        // Process variants for update: calculate phan_tram_km and handle SKU generation for new variants
        product.variants = await Promise.all(variants.map(async (v) => { // Make the callback async
            const phan_tram_km = calculateDiscountPercentage(v.gia, v.gia_km);
            const existingVariant = product.variants.id(v.id);
            
            let variantSku = v.sku; 
            // Nếu là biến thể mới được thêm vào khi update (không có _id), thì tạo SKU mới
            // Hoặc nếu nó là biến thể mới và không có SKU nào được gửi lên (trường hợp hiếm)
            if (!existingVariant && !v.sku) {
                variantSku = await makeSku(ten_sp, v.kich_thuoc, v.mau_sac); // Await here
            }

            return {
                ...v,
                sku: variantSku, 
                phan_tram_km: phan_tram_km,
                created_at: existingVariant ? existingVariant.created_at : new Date(),
                updated_at: new Date()
            };
        }));

        const updatedProduct = await product.save();
        res.json({ success: true, message: 'Cập nhật sản phẩm thành công!', data: updatedProduct });

    } catch (error) {
        console.error('Lỗi khi cập nhật sản phẩm:', error);
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Lỗi trùng lặp dữ liệu (có thể là SKU hoặc Slug).', details: error.message });
        }
        res.status(500).json({ message: 'Lỗi server khi cập nhật sản phẩm.', details: error.message });
    }
});


// ======================================================
// DELETE: Xóa sản phẩm
// ======================================================
router.delete('/:id', async (req, res) => {
    try {
        const deletedProduct = await SanPhamModel.findByIdAndDelete(req.params.id);

        if (!deletedProduct) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        res.json({ message: 'Xóa sản phẩm thành công' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            error: 'Lỗi khi xóa sản phẩm',
            details: error.message
        });
    }
});

// ======================================================
// PUT: Cập nhật trạng thái ẩn/hiện
// ======================================================
router.put('/:id/toggle-visibility', async (req, res) => {
    try {
        const product = await SanPhamModel.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        product.an_hien = !product.an_hien;
        product.updated_at = new Date();

        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } catch (error) {
        console.error('Error toggling visibility:', error);
        res.status(500).json({
            error: 'Lỗi khi cập nhật trạng thái',
            details: error.message
        });
    }
});

// ======================================================
// PUT: Cập nhật trạng thái hot
// ======================================================
router.put('/:id/toggle-hot', async (req, res) => {
    try {
        const product = await SanPhamModel.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        product.hot = !product.hot;
        product.updated_at = new Date();

        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } catch (error) {
        console.error('Error toggling hot status:', error);
        res.status(500).json({
            error: 'Lỗi khi cập nhật trạng thái hot',
            details: error.message
        });
    }
});

// ======================================================
// GET: Thống kê sản phẩm
// ======================================================
router.get('/stats/overview', async (req, res) => {
    try {
        const totalProducts = await SanPhamModel.countDocuments();
        const activeProducts = await SanPhamModel.countDocuments({ an_hien: true });
        const hotProducts = await SanPhamModel.countDocuments({ hot: true });
        const outOfStockProducts = await SanPhamModel.countDocuments({
            'variants.so_luong': { $lte: 0 }
        });

        res.json({
            total: totalProducts,
            active: activeProducts,
            hot: hotProducts,
            outOfStock: outOfStockProducts
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            error: 'Lỗi khi lấy thống kê',
            details: error.message
        });
    }
});

module.exports = router;