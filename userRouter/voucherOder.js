const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Voucher = mongoose.model('voucher', require('../model/schemaVoucher'));

router.get('/check', async (req, res) => {
  const { code, id_customer } = req.query;

  if (!code || !id_customer) {
    return res.status(400).json({ success: false, message: "Thiếu mã hoặc người dùng." });
  }

  try {
    const voucher = await Voucher.findOne({ code, id_customer, is_active: true });

    if (!voucher) {
      return res.status(404).json({ success: false, message: "Voucher không hợp lệ hoặc không thuộc tài khoản này." });
    }

    const now = new Date();
    if (now < new Date(voucher.start_date) || now > new Date(voucher.end_date)) {
      return res.status(400).json({ success: false, message: "Voucher đã hết hạn." });
    }

    res.json({ success: true, data: voucher });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi server khi kiểm tra voucher." });
  }
});

router.patch("/deactivate", async (req, res) => {
  const { code, id_customer } = req.body;

  if (!code || !id_customer) {
    return res.status(400).json({ success: false, message: "Thiếu mã hoặc ID người dùng." });
  }

  try {
    const voucher = await Voucher.findOne({ code, id_customer });

    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher phù hợp." });
    }

    if (!voucher.is_active) {
      return res.status(400).json({ success: false, message: "Voucher đã bị sử dụng." });
    }

    voucher.is_active = false;
    await voucher.save();

    res.json({ success: true, message: "Đã vô hiệu hóa voucher cá nhân thành công." });
  } catch (err) {
    console.error("Lỗi deactivate voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

module.exports = router;