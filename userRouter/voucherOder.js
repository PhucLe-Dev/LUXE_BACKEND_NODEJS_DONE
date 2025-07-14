const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Voucher = mongoose.model('voucher', require('../model/schemaVoucher'));

// GET /api/voucher/customer/:id - Sửa đổi để không lọc theo min_order_value ở đây
router.get("/customer/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const now = new Date();
    const query = {
      id_customer: id,
      is_active: true,
      start_date: { $lte: now }, // Voucher phải bắt đầu trước hoặc vào hôm nay
      end_date: { $gte: now }, // Voucher phải kết thúc sau hoặc vào hôm nay
    };

    const vouchers = await Voucher.find(query).sort({ created_at: -1 });

    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("Lỗi lấy voucher theo người dùng:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});


// GET /check - Giữ nguyên kiểm tra đầy đủ (bao gồm min_order_value) để đảm bảo bảo mật
router.get('/check', async (req, res) => {
  const { code, id_customer, currentTotal } = req.query; // currentTotal là bắt buộc

  if (!code || !id_customer || !currentTotal) {
    return res.status(400).json({ success: false, message: "Thiếu mã, người dùng hoặc tổng tiền." });
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

    // Kiểm tra hạn mức áp dụng
    if (parseFloat(currentTotal) < voucher.min_order_value) {
      return res.status(400).json({ success: false, message: `Đơn hàng chưa đạt giá trị tối thiểu để áp dụng voucher này (${voucher.min_order_value.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}).` });
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