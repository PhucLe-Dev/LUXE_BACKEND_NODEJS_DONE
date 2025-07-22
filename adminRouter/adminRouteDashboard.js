// adminDashboardRoute.js

const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require("../controller/middlewaresController");

const DonHang = mongoose.model("don_hang");
const NguoiDung = mongoose.model("nguoi_dung");
const SanPham = mongoose.model("san_pham");

// ======================================================
// ROUTE: Lấy thống kê tổng quan cho dashboard
// GET /admin/dashboard/summary
// ======================================================
router.get(
  "/summary",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const donHang = await DonHang.countDocuments({
        created_at: { $gte: todayStart, $lte: todayEnd },
      });

      const nguoiDung = await NguoiDung.countDocuments({
        created_at: { $gte: todayStart, $lte: todayEnd },
        vai_tro: "khach_hang",
      });

      const sanPham = await SanPham.countDocuments();

      const doanhThuHomNay = await DonHang.aggregate([
        {
          $match: {
            trang_thai_don_hang: "Giao hàng thành công",
            created_at: { $gte: todayStart, $lte: todayEnd },
          },
        },
        {
          $group: {
            _id: null,
            doanhThu: { $sum: "$tong_tien" },
          },
        },
      ]);

      res.status(200).json({
        total_orders: donHang,
        total_customers: nguoiDung,
        total_products: sanPham,
        today_revenue:
          doanhThuHomNay.length > 0 ? doanhThuHomNay[0].doanhThu : 0,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

// ======================================================
// Helper function được tối ưu hóa để lấy thống kê sản phẩm
// ======================================================
const getAggregatedProductSales = async (start, end) => {
  return await DonHang.aggregate([
    // Giai đoạn 1: Lọc các đơn hàng thành công trong khoảng thời gian
    {
      $match: {
        created_at: { $gte: start, $lte: end },
        trang_thai_don_hang: "Giao hàng thành công",
      },
    },
    // Giai đoạn 2: Tách các sản phẩm trong mỗi đơn hàng ra thành các document riêng
    { $unwind: "$chi_tiet" },
    // Giai đoạn 3: Nhóm theo từng biến thể sản phẩm (variant) để tính tổng số lượng bán và doanh thu
    {
      $group: {
        _id: "$chi_tiet.id_variant",
        totalSold: { $sum: "$chi_tiet.so_luong" },
        totalRevenue: { $sum: { $multiply: ["$chi_tiet.so_luong", "$chi_tiet.gia"] } },
      },
    },
    // Giai đoạn 4: Liên kết với collection 'san_pham' để lấy thông tin chi tiết của sản phẩm
    {
      $lookup: {
        from: "san_pham",
        localField: "_id",
        foreignField: "variants._id",
        as: "productInfo",
      },
    },
    // Giai đoạn 5: Tách mảng productInfo (thường chỉ có 1 phần tử)
    { $unwind: "$productInfo" },
    // Giai đoạn 6: Nhóm lại theo sản phẩm cha (product) để tổng hợp dữ liệu từ các biến thể
    {
      $group: {
        _id: "$productInfo._id",
        ten_sp: { $first: "$productInfo.ten_sp" },
        // Lấy thumbnail của biến thể đầu tiên tìm thấy
        thumbnail: { $first: { $arrayElemAt: ["$productInfo.variants.hinh_chinh", 0] } },
        totalSold: { $sum: "$totalSold" },
        totalRevenue: { $sum: "$totalRevenue" },
      },
    },
    // Giai đoạn 7: Định dạng lại output cuối cùng
    {
      $project: {
        _id: 0,
        id_san_pham: "$_id",
        ten_sp: 1,
        thumbnail: 1,
        totalSold: 1,
        totalRevenue: 1,
      },
    },
  ]);
};


// ======================================================
// ROUTE: Lấy sản phẩm bán chạy dựa trên `so_luong_da_ban` (ĐÃ SỬA LỖI)
// GET /admin/dashboard/san-pham-ban-chay
// ======================================================
router.get(
  "/san-pham-ban-chay",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const topProducts = await SanPham.aggregate([
        // Bước 1: Tách các variants
        { $unwind: "$variants" },
        // Bước 2: Nhóm theo sản phẩm cha và tính tổng
        {
          $group: {
            _id: "$_id",
            ten_sp: { $first: "$ten_sp" },
            thumbnail: { $first: "$variants.hinh_chinh" },
            tong_so_luong_da_ban: { $sum: "$variants.so_luong_da_ban" },
          },
        },
        // Bước 3: Sắp xếp
        { $sort: { tong_so_luong_da_ban: -1 } },
        // Bước 4: Giới hạn kết quả
        { $limit: 10 },
        // --- SỬA LỖI TẠI ĐÂY ---
        // Bước 5: Thêm các trường mặc định để khớp với giao diện
        {
          $addFields: {
            doanh_thu_thang_nay: 0,
            thay_doi_phan_tram: 0,
          },
        },
        // Bước 6: Định dạng lại output cuối cùng
        {
          $project: {
            _id: 0, // Loại bỏ _id
            id_san_pham: "$_id",
            ten_sp: 1, // Giữ lại ten_sp
            thumbnail: 1, // Giữ lại thumbnail
            so_luong_thang_nay: "$tong_so_luong_da_ban", // Đổi tên và giữ lại
            doanh_thu_thang_nay: 1, // Giữ lại trường vừa thêm
            thay_doi_phan_tram: 1, // Giữ lại trường vừa thêm
          },
        },
      ]);

      res.status(200).json({ success: true, data: topProducts });

    } catch (error) {
      console.error("Lỗi khi lấy sản phẩm bán chạy:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi thống kê sản phẩm bán chạy.",
        error: error.message,
      });
    }
  }
);


module.exports = router;