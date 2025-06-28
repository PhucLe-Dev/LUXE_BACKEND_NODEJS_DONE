const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));

router.get('/', async (req, res) => {
  const keyword = req.query.q;
  if (!keyword) return res.json([]);

  try {
    const products = await SanPhamModel.find({
      ten_sp: { $regex: keyword, $options: 'i' }
    })
      .limit(5)
      .select('ten_sp slug');

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

router.get('/find-by-slug', async (req, res) => {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Thiếu slug' });
  }

  try {
    const product = await SanPhamModel.findOne({ slug: decodeURIComponent(slug) });
    if (!product) {
      return res.json({ data: [] });
    }

    res.json({ data: [product] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ khi tìm sản phẩm theo slug' });
  }
});


module.exports = router;