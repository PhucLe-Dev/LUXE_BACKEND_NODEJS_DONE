const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Voucher = mongoose.model('voucher', require('../model/schemaVoucher'));

// GET /api/voucher/customer/:id - Chỉ lấy voucher đang hoạt động (giữ nguyên cho checkout)
router.get("/customer/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const now = new Date();
    const query = {
      id_customer: id,
      is_active: true,
      start_date: { $lte: now },
      end_date: { $gte: now },
    };

    const vouchers = await Voucher.find(query).sort({ created_at: -1 });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("Lỗi lấy voucher theo người dùng:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// GET /api/voucher/customer/:id/all - Lấy tất cả voucher (bao gồm hết hạn) cho trang quản lý
router.get("/customer/:id/all", async (req, res) => {
  const { id } = req.params;

  try {
    const query = {
      id_customer: id
    };

    const vouchers = await Voucher.find(query).sort({ created_at: -1 });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("Lỗi lấy tất cả voucher theo người dùng:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// GET /check - Giữ nguyên kiểm tra đầy đủ (bao gồm min_order_value) để đảm bảo bảo mật
router.get('/check', async (req, res) => {
  const { code, id_customer, currentTotal } = req.query;

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

// GET /api/voucher/stats/:id - Lấy thống kê voucher cho người dùng
router.get("/stats/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const now = new Date();
    const vouchers = await Voucher.find({ id_customer: id });

    const stats = {
      total: vouchers.length,
      active: 0,
      expired: 0,
      soon_expire: 0,
      used: 0,
      unused: 0,
      percent_type: 0,
      fixed_type: 0,
      total_saved: 0,
      avg_discount: 0
    };

    let totalDiscountValue = 0;
    let activeDiscountCount = 0;

    vouchers.forEach(voucher => {
      const startDate = new Date(voucher.start_date);
      const endDate = new Date(voucher.end_date);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (!voucher.is_active) {
        stats.used++;
      } else {
        stats.unused++;

        if (endDate < now) {
          stats.expired++;
        } else if (startDate <= now && endDate >= now) {
          stats.active++;
          activeDiscountCount++;

          if (voucher.discount_type === 'fixed') {
            stats.total_saved += voucher.discount_value;
            totalDiscountValue += voucher.discount_value;
          } else {
            const estimatedSaving = (voucher.discount_value / 100) * 500000;
            stats.total_saved += estimatedSaving;
            totalDiscountValue += estimatedSaving;
          }

          if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
            stats.soon_expire++;
          }
        }
      }

      if (voucher.discount_type === 'percent') {
        stats.percent_type++;
      } else {
        stats.fixed_type++;
      }
    });

    stats.avg_discount = activeDiscountCount > 0 ? totalDiscountValue / activeDiscountCount : 0;

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error("Lỗi lấy thống kê voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// GET /api/voucher/customer/:id/search - Tìm kiếm voucher nâng cao
router.get("/customer/:id/search", async (req, res) => {
  const { id } = req.params;
  const {
    code,
    status,
    type,
    sort_by = 'created_at',
    sort_order = 'desc',
    min_discount,
    max_discount,
    start_date,
    end_date
  } = req.query;

  try {
    const now = new Date();
    let query = { id_customer: id };

    if (code) {
      query.code = { $regex: code, $options: 'i' };
    }

    if (type && type !== 'all') {
      query.discount_type = type;
    }

    if (min_discount || max_discount) {
      query.discount_value = {};
      if (min_discount) query.discount_value.$gte = parseFloat(min_discount);
      if (max_discount) query.discount_value.$lte = parseFloat(max_discount);
    }

    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = new Date(start_date);
      if (end_date) query.created_at.$lte = new Date(end_date);
    }

    let vouchers = await Voucher.find(query);

    if (status && status !== 'all') {
      vouchers = vouchers.filter(voucher => {
        const startDate = new Date(voucher.start_date);
        const endDate = new Date(voucher.end_date);
        const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        switch (status) {
          case 'active':
            return voucher.is_active && startDate <= now && endDate >= now;
          case 'expired':
            return !voucher.is_active || endDate < now;
          case 'soon':
            return voucher.is_active && startDate <= now && endDate >= now && daysUntilExpiry <= 7 && daysUntilExpiry > 0;
          case 'used':
            return !voucher.is_active;
          case 'unused':
            return voucher.is_active;
          default:
            return true;
        }
      });
    }

    vouchers.sort((a, b) => {
      let aValue, bValue;

      switch (sort_by) {
        case 'created_at':
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
          break;
        case 'discount_value':
          aValue = a.discount_value;
          bValue = b.discount_value;
          break;
        case 'end_date':
          aValue = new Date(a.end_date).getTime();
          bValue = new Date(b.end_date).getTime();
          break;
        case 'start_date':
          aValue = new Date(a.start_date).getTime();
          bValue = new Date(b.start_date).getTime();
          break;
        case 'min_order_value':
          aValue = a.min_order_value;
          bValue = b.min_order_value;
          break;
        default:
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
      }

      return sort_order === 'desc' ? bValue - aValue : aValue - bValue;
    });

    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("Lỗi tìm kiếm voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

module.exports = router;