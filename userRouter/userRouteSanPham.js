const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const LoaiSanPhamModel = mongoose.model('loai_san_pham', require('../model/schemaLoaiSanPham'));
const ThuongHieuModel = mongoose.model('thuong_hieu', require('../model/schemaThuongHieu'));
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));

// Route để lấy danh sách sản phẩm với phân trang và bộ lọc
router.get('/san-pham', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page)) || 1;
    const limit = Math.max(1, parseInt(req.query.limit)) || 20;
    const skip = (page - 1) * limit;
    const isRandom = req.query.random === 'true';

    const categories = req.query.category ? (Array.isArray(req.query.category) ? req.query.category.map(id => parseInt(id)) : [parseInt(req.query.category)]) : [];
    const brands = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand.map(id => parseInt(id)) : [parseInt(req.query.brand)]) : [];
    const origins = req.query.origin ? (Array.isArray(req.query.origin) ? req.query.origin : [req.query.origin]) : [];
    const sort = req.query.sort || 'all';

    const matchCondition = { an_hien: true };
    const conditions = [];

    if (categories.length > 0) {
      conditions.push({ id_loai: { $in: categories } });
    }
    if (brands.length > 0) {
      conditions.push({ id_thuong_hieu: { $in: brands } });
    }
    if (origins.length > 0) {
      conditions.push({ xuat_xu: { $in: origins } });
    }

    if (conditions.length > 0) {
      matchCondition.$and = conditions;
    }

    const pipeline = [{ $match: matchCondition }];

    if (isRandom) {
      pipeline.push({ $sample: { size: Math.min(limit, 1000) } }); // Giới hạn size tối đa 1000 để tránh hiệu suất thấp
      pipeline.push({
        $lookup: {
          from: 'thuong_hieu',
          localField: 'id_thuong_hieu',
          foreignField: 'id',
          as: 'thuong_hieu',
        },
      });
      pipeline.push({ $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } });
    }

    if (['discounted', 'price_asc', 'price_desc', 'bestselling'].includes(sort)) {
      pipeline.push({ $unwind: '$variants' });

      if (sort === 'discounted') {
        pipeline.push({
          $match: {
            'variants.gia_km': { $ne: null, $gt: 0 },
            $expr: { $lt: ['$variants.gia_km', '$variants.gia'] },
          },
        });
      }

      pipeline.push({
        $addFields: {
          effectivePrice: {
            $cond: [
              { $and: [{ $ne: ['$variants.gia_km', null] }, { $gt: ['$variants.gia_km', 0] }] },
              '$variants.gia_km',
              '$variants.gia',
            ],
          },
          totalSold: { $ifNull: ['$variants.so_luong_da_ban', 0] },
        },
      });

      pipeline.push({
        $group: {
          _id: '$_id',
          ten_sp: { $first: '$ten_sp' },
          slug: { $first: '$slug' },
          id_loai: { $first: '$id_loai' },
          id_thuong_hieu: { $first: '$id_thuong_hieu' },
          mo_ta: { $first: '$mo_ta' },
          chat_lieu: { $first: '$chat_lieu' },
          xuat_xu: { $first: '$xuat_xu' },
          variants: { $push: '$variants' },
          hot: { $first: '$hot' },
          an_hien: { $first: '$an_hien' },
          luot_xem: { $first: '$luot_xem' },
          tags: { $first: '$tags' },
          meta_title: { $first: '$meta_title' },
          meta_description: { $first: '$meta_description' },
          meta_keywords: { $first: '$meta_keywords' },
          created_at: { $first: '$created_at' },
          updated_at: { $first: '$updated_at' },
          totalSold: { $sum: '$totalSold' },
          minPrice: { $min: '$effectivePrice' },
          maxPrice: { $max: '$effectivePrice' },
        },
      });

      if (sort === 'price_asc') pipeline.push({ $sort: { minPrice: 1 } });
      if (sort === 'price_desc') pipeline.push({ $sort: { minPrice: -1 } });
      if (sort === 'bestselling') pipeline.push({ $sort: { totalSold: -1 } });
      if (sort === 'discounted') pipeline.push({ $sort: { minPrice: 1 } });
    } else if (sort === 'views') {
      pipeline.push({ $sort: { luot_xem: -1 } });
    } else if (sort === 'newest') {
      pipeline.push({ $sort: { created_at: -1 } });
    }

    pipeline.push({
      $facet: {
        paginatedResults: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'thuong_hieu',
              localField: 'id_thuong_hieu',
              foreignField: 'id',
              as: 'thuong_hieu',
            },
          },
          { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const result = await SanPhamModel.aggregate(pipeline);
    const totalProducts = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      data: result[0].paginatedResults,
      pagination: {
        currentPage: page,
        limit,
        totalProducts,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách sản phẩm:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách sản phẩm', error: error.message });
  }
});

// Route để lấy danh sách loại sản phẩm với phân trang
router.get('/loai-san-pham', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const slug = req.query.slug || null; // Lấy query slug

    // Nếu có slug, trả về loại sản phẩm khớp với slug
    if (slug) {
      const loaiSanPham = await LoaiSanPhamModel.findOne({ slug, an_hien: true }).exec();
      if (!loaiSanPham) {
        return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm với slug này' });
      }

      const data = {
        ...loaiSanPham._doc,
        slug: loaiSanPham.slug || loaiSanPham.ten_loai.toLowerCase().replace(/ /g, '-'),
      };

      return res.status(200).json({ data: [data] }); // Trả về mảng để khớp với logic client-side
    }

    // Nếu không có slug, trả về danh sách loại sản phẩm với phân trang (logic cũ)
    if (page < 1 || limit < 1 || isNaN(page) || isNaN(limit)) {
      return res.status(400).json({ message: 'Trang hoặc số lượng loại sản phẩm không hợp lệ' });
    }

    const skip = (page - 1) * limit;

    const totalProducts = await LoaiSanPhamModel.countDocuments({ an_hien: true });
    const listLoaiSanPham = await LoaiSanPhamModel.find({ an_hien: true })
      .skip(skip)
      .limit(limit)
      .exec();

    const data = listLoaiSanPham.map(item => ({
      ...item._doc,
      slug: item.slug || item.ten_loai.toLowerCase().replace(/ /g, '-'),
    }));

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      data: data,
      pagination: {
        currentPage: page,
        limit: limit,
        totalProducts: totalProducts,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching categories products:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách loại sản phẩm', error: error.message });
  }
});

// Route để lấy danh sách thương hiệu với phân trang
router.get('/thuong-hieu', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const slug = req.query.slug || null; // Lấy query slug

    // Nếu có slug, trả về thương hiệu khớp với slug
    if (slug) {
      const thuongHieu = await ThuongHieuModel.findOne({ slug, an_hien: true }).exec();
      if (!thuongHieu) {
        return res.status(404).json({ message: 'Không tìm thấy thương hiệu với slug này' });
      }

      const data = {
        ...thuongHieu._doc,
        slug: thuongHieu.slug || thuongHieu.ten_thuong_hieu.toLowerCase().replace(/ /g, '-'),
      };

      return res.status(200).json({ data: [data] }); // Trả về mảng để khớp với logic client-side
    }

    // Nếu không có slug, trả về danh sách thương hiệu với phân trang (logic cũ)
    if (page < 1 || limit < 1 || isNaN(page) || isNaN(limit)) {
      return res.status(400).json({ message: 'Trang hoặc số lượng thương hiệu không hợp lệ' });
    }

    const skip = (page - 1) * limit;

    const totalProducts = await ThuongHieuModel.countDocuments({ an_hien: true });
    const listThuongHieu = await ThuongHieuModel.find({ an_hien: true })
      .skip(skip)
      .limit(limit)
      .exec();

    const data = listThuongHieu.map(item => ({
      ...item._doc,
      slug: item.slug || item.ten_thuong_hieu.toLowerCase().replace(/ /g, '-'),
    }));

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      data: data,
      pagination: {
        currentPage: page,
        limit: limit,
        totalProducts: totalProducts,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách thương hiệu', error: error.message });
  }
});

// Route để lấy danh sách xuất xứ
router.get('/xuat-xu', async (req, res) => {
  try {
    const origins = await SanPhamModel.aggregate([
      { $match: { an_hien: true } },
      { $group: { _id: '$xuat_xu' } },
      { $match: { _id: { $ne: null } } },
      { $sort: { _id: 1 } },
      { $project: { name: '$_id', _id: 0 } },
    ]);

    res.status(200).json(origins);
  } catch (error) {
    console.error('Error fetching origins:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách xuất xứ', error: error.message });
  }
});

// Route để lấy danh sách sản phẩm theo SKU
router.get('/san-pham/:sku', async (req, res) => {
  try {
    const sku = req.params.sku;

    let sanpham = await SanPhamModel.aggregate([
      { $match: { 'variants.sku': sku } },
      {
        $lookup: {
          from: 'thuong_hieu',
          localField: 'id_thuong_hieu',
          foreignField: 'id',
          as: 'thuong_hieu',
        },
      },
      {
        $lookup: {
          from: 'loai_san_pham',
          localField: 'id_loai',
          foreignField: 'id',
          as: 'loai_san_pham',
        },
      },
      { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$loai_san_pham', preserveNullAndEmptyArrays: true } },
      { $set: { luot_xem: { $add: ['$luot_xem', 1] } } },
    ]);

    if (!sanpham || sanpham.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await SanPhamModel.updateOne({ 'variants.sku': sku }, { $inc: { luot_xem: 1 } });

    res.status(200).json(sanpham[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Error fetching product', error: error.message });
  }
});

// Route để lấy danh sách sản phẩm liên quan theo id loại sản phẩm và id thương hiệu
router.get('/san-pham-lien-quan/:sku', async (req, res) => {
  try {
    const sku = req.params.sku;

    const currentProduct = await SanPhamModel.aggregate([
      { $match: { 'variants.sku': sku } },
      {
        $lookup: {
          from: 'thuong_hieu',
          localField: 'id_thuong_hieu',
          foreignField: 'id',
          as: 'thuong_hieu',
        },
      },
      {
        $lookup: {
          from: 'loai_san_pham',
          localField: 'id_loai',
          foreignField: 'id',
          as: 'loai_san_pham',
        },
      },
      { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$loai_san_pham', preserveNullAndEmptyArrays: true } },
      { $limit: 1 },
    ]);

    if (!currentProduct || currentProduct.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { id_loai, id_thuong_hieu } = currentProduct[0];

    const relatedProducts = await SanPhamModel.aggregate([
      {
        $match: {
          $and: [{ id_loai: id_loai }, { id_thuong_hieu: id_thuong_hieu }, { 'variants.sku': { $ne: sku } }],
        },
      },
      {
        $lookup: {
          from: 'thuong_hieu',
          localField: 'id_thuong_hieu',
          foreignField: 'id',
          as: 'thuong_hieu',
        },
      },
      {
        $lookup: {
          from: 'loai_san_pham',
          localField: 'id_loai',
          foreignField: 'id',
          as: 'loai_san_pham',
        },
      },
      { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$loai_san_pham', preserveNullAndEmptyArrays: true } },
      { $sample: { size: 4 } },
    ]);

    res.status(200).json(relatedProducts);
  } catch (error) {
    console.error('Error fetching related products:', error);
    res.status(500).json({ message: 'Error fetching related products', error: error.message });
  }
});

// Route để lấy tất cả sản phẩm theo loại sản phẩm hoặc thương hiệu dựa trên slug (có phân trang và bộ lọc bổ sung)
router.get('/san-pham/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Kiểm tra xem slug thuộc loại sản phẩm hay thương hiệu
    const loai = await LoaiSanPhamModel.findOne({ slug, an_hien: true });
    const thuongHieu = await ThuongHieuModel.findOne({ slug, an_hien: true });

    if (!loai && !thuongHieu) {
      return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm hoặc thương hiệu' });
    }

    // Lấy các bộ lọc từ query params
    const categories = req.query.category ? (Array.isArray(req.query.category) ? req.query.category.map(id => parseInt(id)) : [parseInt(req.query.category)]) : [];
    const brands = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand.map(id => parseInt(id)) : [parseInt(req.query.brand)]) : [];
    const origins = req.query.origin ? (Array.isArray(req.query.origin) ? req.query.origin : [req.query.origin]) : [];
    const sort = req.query.sort || 'all';

    console.log('Query Params - Categories:', categories);
    console.log('Query Params - Brands:', brands);
    console.log('Query Params - Origins:', origins);

    // Xây dựng điều kiện match
    const matchCondition = { an_hien: true };
    const conditions = [];

    // Thêm điều kiện từ slug
    if (loai) {
      conditions.push({ id_loai: loai.id });
    } else if (thuongHieu) {
      conditions.push({ id_thuong_hieu: thuongHieu.id });
    }

    // Thêm điều kiện từ các bộ lọc checkbox
    if (categories.length > 0) {
      conditions.push({ id_loai: { $in: categories } });
    }
    if (brands.length > 0) {
      conditions.push({ id_thuong_hieu: { $in: brands } });
    }
    if (origins.length > 0) {
      conditions.push({ xuat_xu: { $in: origins } });
    }

    if (conditions.length > 0) {
      matchCondition.$and = conditions;
    }

    const pipeline = [{ $match: matchCondition }];

    if (['discounted', 'price_asc', 'price_desc', 'bestselling'].includes(sort)) {
      pipeline.push({ $unwind: '$variants' });

      if (sort === 'discounted') {
        pipeline.push({
          $match: {
            'variants.gia_km': { $ne: null, $gt: 0 },
            $expr: { $lt: ['$variants.gia_km', '$variants.gia'] },
          },
        });
      }

      pipeline.push({
        $addFields: {
          effectivePrice: {
            $cond: [
              { $and: [{ $ne: ['$variants.gia_km', null] }, { $gt: ['$variants.gia_km', 0] }] },
              '$variants.gia_km',
              '$variants.gia',
            ],
          },
          totalSold: { $ifNull: ['$variants.so_luong_da_ban', 0] },
        },
      });

      pipeline.push({
        $group: {
          _id: '$_id',
          ten_sp: { $first: '$ten_sp' },
          slug: { $first: '$slug' },
          id_loai: { $first: '$id_loai' },
          id_thuong_hieu: { $first: '$id_thuong_hieu' },
          mo_ta: { $first: '$mo_ta' },
          chat_lieu: { $first: '$chat_lieu' },
          xuat_xu: { $first: '$xuat_xu' },
          variants: { $push: '$variants' },
          hot: { $first: '$hot' },
          an_hien: { $first: '$an_hien' },
          luot_xem: { $first: '$luot_xem' },
          tags: { $first: '$tags' },
          meta_title: { $first: '$meta_title' },
          meta_description: { $first: '$meta_description' },
          meta_keywords: { $first: '$meta_keywords' },
          created_at: { $first: '$created_at' },
          updated_at: { $first: '$updated_at' },
          totalSold: { $sum: '$totalSold' },
          minPrice: { $min: '$effectivePrice' },
          maxPrice: { $max: '$effectivePrice' },
        },
      });

      if (sort === 'price_asc') pipeline.push({ $sort: { minPrice: 1 } });
      if (sort === 'price_desc') pipeline.push({ $sort: { minPrice: -1 } });
      if (sort === 'bestselling') pipeline.push({ $sort: { totalSold: -1 } });
      if (sort === 'discounted') pipeline.push({ $sort: { minPrice: 1 } });
    } else if (sort === 'views') {
      pipeline.push({ $sort: { luot_xem: -1 } });
    } else if (sort === 'newest') {
      pipeline.push({ $sort: { created_at: -1 } });
    }

    pipeline.push({
      $facet: {
        paginatedResults: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'thuong_hieu',
              localField: 'id_thuong_hieu',
              foreignField: 'id',
              as: 'thuong_hieu',
            },
          },
          { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const result = await ProductModel.aggregate(pipeline);
    console.log('Aggregation Result:', result);
    const totalProducts = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      data: result[0].paginatedResults,
      pagination: {
        currentPage: page,
        limit,
        totalProducts,
        totalPages,
      },
    });
  } catch (err) {
    console.error('Lỗi server:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;