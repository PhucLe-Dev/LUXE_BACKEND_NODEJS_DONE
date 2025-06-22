const mongoose = require("mongoose");
const conn = mongoose.createConnection("mongodb://127.0.0.1:27017/fashion_web25");
const express = require("express");
const router = express.Router();
const Voucher = conn.model('voucher', require('../model/schemaVoucher'));

router.get('/check', async (req, res) => {
  const { code } = req.query;

  try {
    const voucher = await Voucher.findOne({ code, is_active: true });
    if (!voucher) {
      return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn!' });
    }

    const currentDate = new Date();
    if (currentDate < voucher.start_date || currentDate > voucher.end_date) {
      return res.status(400).json({ success: false, message: 'Mã đã hết hạn!' });
    }

    res.json({ success: true, data: voucher });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server!' });
  }
});

module.exports = router;