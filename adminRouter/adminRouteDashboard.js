const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require("../controller/middlewaresController");

const DonHang = mongoose.model("don_hang");
const NguoiDung = mongoose.model("nguoi_dung");
const SanPham = mongoose.model("san_pham");

router.get(
  "/summary",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const donHang = await DonHang.find({
        created_at: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }).count();
      const nguoiDung = await NguoiDung.find({
        created_at: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        vai_tro: "khach_hang",
      }).count();
      const sanPham = await SanPham.find().count();
      const doanhThuHomNay = await DonHang.aggregate([
        {
          $match: {
            trang_thai_don_hang: "Giao hàng thành công",
            created_at: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
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

router.get(
  "/san-pham-ban-chay",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const now = new Date();
      const endDate = new Date(now.setHours(23, 59, 59, 999));
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const prevEndDate = new Date(startDate.getTime() - 1);
      const prevStartDate = new Date(
        prevEndDate.getTime() - 30 * 24 * 60 * 60 * 1000
      );

      // Helper: Get sales by product ID
      const getProductSales = async (start, end) => {
        const rawItems = await DonHang.aggregate([
          {
            $match: {
              created_at: { $gte: start, $lte: end },
              trang_thai_don_hang: "Giao hàng thành công",
            },
          },
          { $unwind: "$chi_tiet" },
          {
            $project: {
              id_variant: "$chi_tiet.id_variant",
              so_luong: "$chi_tiet.so_luong",
              gia: "$chi_tiet.gia",
            },
          },
          {
            $group: {
              _id: "$id_variant",
              totalSold: { $sum: "$so_luong" },
              totalRevenue: { $sum: { $multiply: ["$so_luong", "$gia"] } },
            },
          },
        ]);

        const variantIds = rawItems.map((i) => i._id);

        const products = await SanPham.find(
          { "variants._id": { $in: variantIds } },
          { ten_sp: 1, variants: 1 }
        ).lean();

        const variantToProduct = new Map();
        for (const product of products) {
          for (const variant of product.variants) {
            variantToProduct.set(variant._id.toString(), {
              id_san_pham: product._id,
              ten_sp: product.ten_sp,
              thumbnail: variant.hinh_chinh,
            });
          }
        }

        const productSales = new Map();
        for (const item of rawItems) {
          const info = variantToProduct.get(item._id.toString());
          if (!info) continue;

          const key = info.id_san_pham.toString();
          if (!productSales.has(key)) {
            productSales.set(key, {
              id_san_pham: info.id_san_pham,
              ten_sp: info.ten_sp,
              thumbnail: info.thumbnail,
              totalSold: 0,
              totalRevenue: 0,
            });
          }

          const current = productSales.get(key);
          current.totalSold += item.totalSold;
          current.totalRevenue += item.totalRevenue;
        }

        return productSales;
      };

      const [currentMap, prevMap] = await Promise.all([
        getProductSales(startDate, endDate),
        getProductSales(prevStartDate, prevEndDate),
      ]);

      // Kết hợp tất cả id_san_pham
      const allProductIds = new Set([...currentMap.keys(), ...prevMap.keys()]);

      const result = Array.from(allProductIds).map((productId) => {
        const current = currentMap.get(productId);
        const previous = prevMap.get(productId);

        const so_luong_thang_nay = current?.totalSold || 0;
        const so_luong_thang_truoc = previous?.totalSold || 0;
        const doanh_thu_thang_nay = current?.totalRevenue || 0;
        const doanh_thu_thang_truoc = previous?.totalRevenue || 0;

        let percentChange = 0;
        if (so_luong_thang_truoc === 0 && so_luong_thang_nay > 0)
          percentChange = 100;
        else if (so_luong_thang_truoc === 0) percentChange = 0;
        else
          percentChange =
            ((so_luong_thang_nay - so_luong_thang_truoc) /
              so_luong_thang_truoc) *
            100;

        return {
          id_san_pham: productId,
          ten_sp: current?.ten_sp || previous?.ten_sp || "Không xác định",
          thumbnail: current?.thumbnail || previous?.thumbnail || null,
          so_luong_thang_nay,
          so_luong_thang_truoc,
          doanh_thu_thang_nay,
          doanh_thu_thang_truoc,
          thay_doi_phan_tram: +percentChange.toFixed(2),
        };
      });

      // Sắp xếp theo số lượng bán tháng này
      result.sort((a, b) => b.so_luong_thang_nay - a.so_luong_thang_nay);

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi thống kê sản phẩm bán chạy theo tháng.",
        error: error.message,
      });
    }
  }
);

module.exports = router;
