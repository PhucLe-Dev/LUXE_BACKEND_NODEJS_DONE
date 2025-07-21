const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// Import các models và middlewares cần thiết
const middlewaresController = require("../controller/middlewaresController");
const DonHang = mongoose.model("don_hang");
const NguoiDung = mongoose.model("nguoi_dung");
const SanPham = mongoose.model("san_pham");
const Voucher = mongoose.model("voucher");
const LoaiSanPham = mongoose.model("loai_san_pham");
// Import dịch vụ email
const { sendOrderStatusEmail } = require("../services/emailService");

// ======================================================
// 1. Lấy danh sách tất cả đơn hàng
// ======================================================
router.get(
  "/",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        trang_thai_don_hang,
        dateRange,
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const query = {};

      if (search) {
        query.$or = [
          { ma_don_hang: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { sdt: { $regex: search, $options: "i" } },
          { ho_ten: { $regex: search, $options: "i" } },
        ];
      }

      if (trang_thai_don_hang) {
        query.trang_thai_don_hang = trang_thai_don_hang;
      }

      if (dateRange) {
        const endDate = new Date();
        let startDate = new Date();
        switch (dateRange) {
          case "today": startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999); break;
          case "last7days": startDate.setDate(endDate.getDate() - 7); break;
          case "last30days": startDate.setDate(endDate.getDate() - 30); break;
          case "last90days": startDate.setDate(endDate.getDate() - 90); break;
          case "last1year": startDate.setFullYear(endDate.getFullYear() - 1); break;
          default: startDate = null;
        }
        if (startDate) {
          query.created_at = { $gte: startDate, $lte: endDate };
        }
      }

      const orders = await DonHang.find(query)
        .sort({ ma_don_hang: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("id_customer", "ho_ten email sdt avatar")
        .populate("id_shipper", "ho_ten email sdt avatar")
        .populate("id_voucher", "code discount_type discount_value")
        .lean();

      const totalOrders = await DonHang.countDocuments(query);
      const totalPages = Math.ceil(totalOrders / parseInt(limit));

      res.status(200).json({
        success: true,
        data: orders,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalOrders,
          totalPages,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy danh sách đơn hàng.",
        error: error.message,
      });
    }
  }
);

// ======================================================
// 2. Reports (Báo cáo)
// ======================================================
router.get(
  "/report",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const { from, to } = req.query;
      let startDate, endDate;

      if (from && to) {
        startDate = new Date(from);
        endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date();
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const rangeMs = endDate.getTime() - startDate.getTime();
      const prevStartDate = new Date(startDate.getTime() - rangeMs);
      const prevEndDate = new Date(startDate.getTime() - 1);

      // --- NOTE: HÀM TÍNH TOÁN BÁO CÁO TỔNG QUAN ---
      // Chỉ tính trên các đơn hàng "Giao hàng thành công" để đảm bảo số liệu chính xác.
      const getReportData = async (start, end) => {
        const result = await DonHang.aggregate([
          { $match: { created_at: { $gte: start, $lte: end }, trang_thai_don_hang: "Giao hàng thành công" } },
          { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: "$tong_tien" }, averageOrderValue: { $avg: "$tong_tien" } } }
        ]);
        return result[0] || { totalOrders: 0, totalRevenue: 0, averageOrderValue: 0 };
      };
      
      // --- NOTE: HÀM TÍNH DOANH THU THEO NGÀY ---
      // Chỉ tính trên các đơn hàng "Giao hàng thành công".
      const getDailyRevenue = async (start, end) => {
        const result = await DonHang.aggregate([
          { $match: { created_at: { $gte: start, $lte: end }, trang_thai_don_hang: "Giao hàng thành công" } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, totalRevenue: { $sum: "$tong_tien" }, totalOrders: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);
        const map = new Map();
        result.forEach((item) => map.set(item._id, item));
        const days = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          days.push(map.get(dateStr) || { date: dateStr, totalRevenue: 0, totalOrders: 0 });
        }
        return days;
      };

      // --- NOTE: HÀM LẤY SẢN PHẨM BÁN CHẠY ---
      // Chỉ tính trên các đơn hàng "Giao hàng thành công".
      const getTopProducts = async (start, end) => {
        const topVariants = await DonHang.aggregate([
            { $match: { created_at: { $gte: start, $lte: end }, trang_thai_don_hang: "Giao hàng thành công" } },
            { $unwind: "$chi_tiet" },
            { $group: { _id: "$chi_tiet.id_variant", totalSold: { $sum: "$chi_tiet.so_luong" }, totalRevenue: { $sum: { $multiply: ["$chi_tiet.so_luong", "$chi_tiet.gia"] } } } },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);
        const variantIds = topVariants.map((v) => v._id);
        const products = await SanPham.find({ "variants._id": { $in: variantIds } }, { ten_sp: 1, "variants.$": 1 }).lean();
        const variantIdToProduct = new Map();
        products.forEach(p => {
            if (p.variants && p.variants.length > 0) {
                variantIdToProduct.set(p.variants[0]._id.toString(), { ten_sp: p.ten_sp, id_san_pham: p._id });
            }
        });
        return topVariants.map(v => ({ ...v, ...variantIdToProduct.get(v._id.toString()) }));
      };
      
      // --- NOTE: HÀM LẤY DOANH THU THEO DANH MỤC ---
      // Chỉ tính trên các đơn hàng "Giao hàng thành công".
      const getRevenueByCategory = async (start, end) => {
        const items = await DonHang.aggregate([
            { $match: { created_at: { $gte: start, $lte: end }, trang_thai_don_hang: "Giao hàng thành công" } },
            { $unwind: "$chi_tiet" },
            { $project: { id_variant: "$chi_tiet.id_variant", so_luong: "$chi_tiet.so_luong", gia: "$chi_tiet.gia" } }
        ]);
        const variantIds = items.map(i => i.id_variant);
        const products = await SanPham.find({ "variants._id": { $in: variantIds } }, { id_loai: 1, variants: 1 }).lean();
        const variantIdToCategory = new Map();
        products.forEach(p => p.variants.forEach(v => variantIdToCategory.set(v._id.toString(), p.id_loai)));
        const categoryRevenueMap = new Map();
        items.forEach(item => {
            const id_loai = variantIdToCategory.get(item.id_variant.toString());
            if (!id_loai) return;
            const revenue = item.so_luong * item.gia;
            const current = categoryRevenueMap.get(id_loai.toString()) || { id_loai, totalRevenue: 0, totalSold: 0 };
            current.totalRevenue += revenue;
            current.totalSold += item.so_luong;
            categoryRevenueMap.set(id_loai.toString(), current);
        });
        const loaiIds = Array.from(categoryRevenueMap.values()).map(item => item.id_loai);
        const loaiList = await LoaiSanPham.find({ id: { $in: loaiIds } }, { id: 1, ten_loai: 1 }).lean();
        const loaiMap = new Map(loaiList.map(l => [l.id.toString(), l.ten_loai]));
        return Array.from(categoryRevenueMap.values()).map(item => ({ ...item, ten_loai: loaiMap.get(item.id_loai.toString()) || "Không xác định" }));
      };

      const [current, previous, dailyRevenue, topProducts, revenueByCategory] = await Promise.all([
        getReportData(startDate, endDate),
        getReportData(prevStartDate, prevEndDate),
        getDailyRevenue(startDate, endDate),
        getTopProducts(startDate, endDate),
        getRevenueByCategory(startDate, endDate),
      ]);

      const calcChange = (currentValue, prevValue) => {
        if (prevValue === 0) return currentValue > 0 ? 100 : 0;
        return ((currentValue - prevValue) / prevValue) * 100;
      };

      res.status(200).json({
        success: true,
        data: {
          current: { ...current, from: startDate, to: endDate },
          previous: { ...previous, from: prevStartDate, to: prevEndDate },
          change: {
            totalOrders: calcChange(current.totalOrders, previous.totalOrders),
            totalRevenue: calcChange(current.totalRevenue, previous.totalRevenue),
            averageOrderValue: calcChange(current.averageOrderValue, previous.averageOrderValue),
          },
          dailyRevenue,
          topProducts,
          revenueByCategory,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Lỗi server khi tạo báo cáo.", error: error.message });
    }
  }
);

// ======================================================
// 3. Lấy chi tiết một đơn hàng
// ======================================================
router.get(
  "/:id",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "ID đơn hàng không hợp lệ." });
      }

      const order = await DonHang.findById(id)
        .populate("id_customer", "ho_ten email sdt avatar")
        .populate("id_shipper", "ho_ten email sdt avatar")
        .populate("id_voucher")
        .lean();

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy đơn hàng." });
      }

      for (let i = 0; i < order.chi_tiet.length; i++) {
        const item = order.chi_tiet[i];
        if (item.id_variant) {
          const product = await SanPham.findOne({
            "variants._id": item.id_variant,
          }).lean();
          if (product) {
            const variant = product.variants.find((v) =>
              v._id.equals(item.id_variant)
            );
            if (variant) {
              if (item.gia_goc === undefined) {
                item.gia_goc = variant.gia;
              }
              item.id_variant = {
                _id: variant._id,
                sku: variant.sku,
                kich_thuoc: variant.kich_thuoc,
                mau_sac: variant.mau_sac,
                hinh_chinh: variant.hinh_chinh,
                ten_sp: product.ten_sp,
                slug: product.slug,
              };
            }
          }
        }
      }

      res.status(200).json({ success: true, data: order });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy chi tiết đơn hàng.",
        error: error.message,
      });
    }
  }
);

// ======================================================
// 4. Tạo đơn hàng thủ công
// ======================================================
router.post(
  "/",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
        const { ho_ten, email, sdt, dia_chi_giao_hang, phuong_thuc_thanh_toan, ghi_chu, chi_tiet } = req.body;
        if (!ho_ten || !sdt || !dia_chi_giao_hang || !chi_tiet || chi_tiet.length === 0) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp đủ thông tin khách hàng và sản phẩm." });
        }
        if (!email) {
            return res.status(400).json({ success: false, message: "Email khách hàng là bắt buộc." });
        }
        const customer = await NguoiDung.findOne({ email: email.toLowerCase() });
        if (!customer) {
            return res.status(404).json({ success: false, message: `Không tìm thấy khách hàng với email: ${email}.` });
        }

        let tong_tien = 0;
        const chiTietDonHang = [];

        for (const item of chi_tiet) {
            const product = await SanPham.findOne({ 'variants.sku': item.id_variant });
            if (!product) return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm với SKU: ${item.id_variant}` });
            
            const variant = product.variants.find(v => v.sku === item.id_variant);
            if (!variant) return res.status(404).json({ success: false, message: `SKU ${item.id_variant} không tồn tại.` });
            if (variant.so_luong < item.so_luong) return res.status(400).json({ success: false, message: `Sản phẩm ${variant.sku} không đủ số lượng.` });

            const giaBan = variant.gia_km || variant.gia;
            tong_tien += giaBan * item.so_luong;

            chiTietDonHang.push({
                id_variant: variant._id,
                so_luong: item.so_luong,
                gia: giaBan,
                gia_goc: variant.gia
            });

            variant.so_luong -= item.so_luong;
            variant.so_luong_da_ban = (variant.so_luong_da_ban || 0) + item.so_luong;
            await product.save();
        }

        const lastOrder = await DonHang.findOne().sort({ ma_don_hang: -1 });
        let newOrderCode = 'DH001';
        if (lastOrder && lastOrder.ma_don_hang) {
            const lastNum = parseInt(lastOrder.ma_don_hang.replace('DH', ''));
            newOrderCode = 'DH' + (lastNum + 1).toString().padStart(3, '0');
        }

        const newOrder = new DonHang({
            ma_don_hang: newOrderCode,
            id_customer: customer._id,
            ho_ten,
            email,
            sdt,
            dia_chi_giao_hang,
            phuong_thuc_thanh_toan,
            ghi_chu,
            chi_tiet: chiTietDonHang,
            tong_tien,
            trang_thai_thanh_toan: 'Chưa thanh toán',
            trang_thai_don_hang: 'Chờ xác nhận'
        });

        const savedOrder = await newOrder.save();
        res.status(201).json({ success: true, message: 'Tạo đơn hàng thành công!', data: savedOrder });

    } catch (error) {
        console.error("Lỗi khi tạo đơn hàng thủ công:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi tạo đơn hàng.' });
    }
  }
);

// ======================================================
// 5. Cập nhật trạng thái đơn hàng và gán shipper
// ======================================================
router.put(
  "/:id/status",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
        const { id } = req.params;
        const { trang_thai_don_hang, trang_thai_thanh_toan, id_shipper } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "ID đơn hàng không hợp lệ." });
        }

        const orderToUpdate = await DonHang.findById(id);
        if (!orderToUpdate) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng để cập nhật.' });
        }
        
        const oldStatus = orderToUpdate.trang_thai_don_hang;
        const newStatus = trang_thai_don_hang;
        const updateFields = { updated_at: Date.now() };

        if (newStatus && newStatus !== oldStatus) {
            const validOrderStatuses = DonHang.schema.path('trang_thai_don_hang').enumValues;
            if (!validOrderStatuses.includes(newStatus)) {
                return res.status(400).json({ success: false, message: `Trạng thái đơn hàng không hợp lệ.` });
            }
            updateFields.trang_thai_don_hang = newStatus;

            if (newStatus === 'Hủy đơn hàng') {
                for (const item of orderToUpdate.chi_tiet) {
                    await SanPham.updateOne({ 'variants._id': item.id_variant }, { $inc: { 'variants.$.so_luong': item.so_luong, 'variants.$.so_luong_da_ban': -item.so_luong } });
                }
                if (orderToUpdate.id_voucher) await Voucher.findByIdAndUpdate(orderToUpdate.id_voucher, { $inc: { so_luong_da_dung: -1 } });
            } else if (oldStatus === 'Hủy đơn hàng') {
                for (const item of orderToUpdate.chi_tiet) {
                    const product = await SanPham.findOne({ 'variants._id': item.id_variant }, { 'variants.$': 1 });
                    if (product.variants[0].so_luong < item.so_luong) throw new Error(`Không đủ tồn kho để phục hồi sản phẩm.`);
                }
                for (const item of orderToUpdate.chi_tiet) {
                    await SanPham.updateOne({ 'variants._id': item.id_variant }, { $inc: { 'variants.$.so_luong': -item.so_luong, 'variants.$.so_luong_da_ban': item.so_luong } });
                }
                if (orderToUpdate.id_voucher) await Voucher.findByIdAndUpdate(orderToUpdate.id_voucher, { $inc: { so_luong_da_dung: 1 } });
            }
        }

        if (trang_thai_thanh_toan) {
            updateFields.trang_thai_thanh_toan = trang_thai_thanh_toan;
        }

        if (id_shipper !== undefined) {
            if (id_shipper !== null && id_shipper !== "") {
                if (!mongoose.Types.ObjectId.isValid(id_shipper)) {
                    return res.status(400).json({ success: false, message: "ID shipper không hợp lệ." });
                }
                const shipperExists = await NguoiDung.findOne({ _id: id_shipper, vai_tro: "shipper" });
                if (!shipperExists) {
                    return res.status(400).json({ success: false, message: "Shipper không tồn tại hoặc không có vai trò hợp lệ." });
                }
            }
            updateFields.id_shipper = id_shipper;
        }

        const updatedOrder = await DonHang.findByIdAndUpdate(id, { $set: updateFields }, { new: true });
        
        if (trang_thai_don_hang && (trang_thai_don_hang === "Đã xác nhận" || trang_thai_don_hang === "Hủy đơn hàng")) {
            const fullOrderDetails = await DonHang.findById(updatedOrder._id).lean();
            // ... logic chuẩn bị dữ liệu để gửi mail
            // await sendOrderStatusEmail(fullOrderDetails, trang_thai_don_hang);
        }
        
        const finalOrder = await DonHang.findById(updatedOrder._id).populate("id_customer", "ho_ten email").populate("id_shipper", "ho_ten email").lean();
        req.io.emit("orderStatusUpdated", finalOrder);
        res.status(200).json({ success: true, message: "Cập nhật trạng thái đơn hàng thành công.", data: finalOrder });

    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái đơn hàng:", error);
        res.status(500).json({ success: false, message: error.message || "Lỗi server khi cập nhật trạng thái đơn hàng." });
    }
  }
);

// ======================================================
// 6. Xóa đơn hàng
// ======================================================
router.delete(
  "/:id",
  middlewaresController.verifyToken,
  middlewaresController.verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "ID đơn hàng không hợp lệ." });
      }
      const deletedOrder = await DonHang.findByIdAndDelete(id);
      if (!deletedOrder) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy đơn hàng để xóa." });
      }
      req.io.emit("orderDeleted", deletedOrder._id);
      res.status(200).json({
        success: true,
        message: "Đơn hàng đã được xóa vĩnh viễn.",
        data: deletedOrder,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi server khi xóa đơn hàng.",
        error: error.message,
      });
    }
  }
);

module.exports = router;
