const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));

// api search
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

module.exports = router;