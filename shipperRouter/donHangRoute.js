const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const DonHangSchema = require("../model/schemaDonHang");
const middlewaresController = require("../controller/middlewaresController");

// Define status transitions in a configuration object for easy maintenance
const STATUS_TRANSITIONS = {
  "Shipper đã nhận hàng": "Đang giao",
  "Đang giao": "Đã giao",
  "Đã giao": "Giao hàng thành công",
};

// Route lấy tất cả đơn hàng
router.get("/get-all-orders", async (req, res) => {
  try {
    const donHang = await mongoose
      .model("don_hang", DonHangSchema)
      .find()
      .populate("id_customer", "ho_ten email");
    res.status(200).json(donHang);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Route cập nhật trạng thái đơn hàng
router.put("/update-status/:id", async (req, res) => {
  try {
    const DonHang = mongoose.model("don_hang", DonHangSchema);
    const donHang = await DonHang.findById(req.params.id);

    if (!donHang) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const currentStatus = donHang.trang_thai_don_hang;

    const nextStatus = STATUS_TRANSITIONS[currentStatus];

    if (!nextStatus) {
      return res.status(400).json({
        message: "Không thể cập nhật trạng thái từ trạng thái hiện tại 111",
      });
    }

    // Update order
    donHang.trang_thai_don_hang = nextStatus;
    donHang.updated_at = Date.now();
    await donHang.save();

    return res.status(200).json({
      message: "Cập nhật trạng thái thành công",
      data: {
        id: donHang._id,
        previous_status: currentStatus,
        new_status: nextStatus,
        updated_at: donHang.updated_at,
      },
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({
      message: "Lỗi server khi cập nhật trạng thái",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.put("/cancel-order/:id", async (req, res) => {
  try {
    const DonHang = mongoose.model("don_hang", DonHangSchema);
    const donHang = await DonHang.findById(req.params.id);

    if (!donHang) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    if (donHang.trang_thai_don_hang !== "Nhận Đơn") {
      return res.status(400).json({
        message: 'Chỉ có thể huỷ đơn hàng khi đang ở trạng thái "Nhận Đơn"',
      });
    }

    donHang.trang_thai_don_hang = "Hủy";
    donHang.updated_at = Date.now();
    await donHang.save();

    res.status(200).json({ message: "Huỷ đơn hàng thành công", donHang });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server khi huỷ đơn hàng" });
  }
});

router.get(
  "/get-my-orders",
  middlewaresController.verifyToken,
  async (req, res) => {
    try {
      const DonHang = mongoose.model("don_hang", DonHangSchema);

      const shipperId = req.user.id;

      const donHangList = await DonHang.find({
        id_shipper: new mongoose.Types.ObjectId(shipperId),
      }).populate("id_customer", "ho_ten email");

      res.status(200).json(donHangList);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Lỗi server khi lấy đơn hàng của shipper" });
    }
  }
);

// New API
router.get(
  "/get-my-order/:id",
  middlewaresController.verifyToken,
  async (req, res) => {
    try {
      const DonHang = mongoose.model("don_hang", DonHangSchema);
      const donHang = await DonHang.findById(req.params.id).populate(
        "id_customer",
        "ho_ten email"
      );

      if (!donHang) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      res.status(200).json(donHang);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Lỗi server khi lấy đơn hàng của shipper" });
    }
  }
);

router.get(
  "/get-my-orders-today",
  middlewaresController.verifyToken,
  async (req, res) => {
    try {
      const DonHang = mongoose.model("don_hang", DonHangSchema);
      const shipperId = req.user.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const donHangList = await DonHang.find({
        id_shipper: new mongoose.Types.ObjectId(shipperId),
        updated_at: { $gte: today },
        trang_thai_don_hang: { $ne: "Giao hàng thành công" },
      }).populate("id_customer", "ho_ten email");

      res.status(200).json(donHangList);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Lỗi server khi lấy đơn hàng của shipper" });
    }
  }
);

module.exports = router;
