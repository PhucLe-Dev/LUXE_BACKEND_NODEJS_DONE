const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DonHang = mongoose.model('don_hang', require('../model/schemaDonHang'));

// Hàm sinh mã đơn hàng duy nhất
const generateUniqueOrderCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    const randomCode = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    code = `DH${randomCode}`;
    const existing = await DonHang.findOne({ ma_don_hang: code });
    if (!existing) exists = false;
  }

  return code;
};

router.post("/", async (req, res) => {
  try {
    const data = req.body;

    // Tự tạo mã đơn hàng duy nhất
    const ma_don_hang = await generateUniqueOrderCode();

    const newOrder = new DonHang({
      ...data,
      ma_don_hang,
      trang_thai_don_hang: "Chờ xác nhận", // mặc định
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Tạo đơn hàng thành công!",
      data: newOrder  
    });
  } catch (err) {
    console.error("Lỗi tạo đơn hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
  }
});
module.exports = router;