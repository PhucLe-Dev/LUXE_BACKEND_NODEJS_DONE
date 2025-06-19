const mongoose = require("mongoose");
const conn = mongoose.createConnection("mongodb://127.0.0.1:27017/fashion_web25");
const express = require("express");
const router = express.Router();
const GioHang = conn.model("gio_hang", require("../model/schemaGioHang"));
const SanPham = conn.model("san_pham", require("../model/schemaSanPham"));

router.post("/add", async (req, res) => {
  const { id_customer, id_thuoc_tinh, so_luong, gia } = req.body;

  try {
    if (!id_customer) {
      return res.status(400).json({ success: false, message: "Yêu cầu đăng nhập!" });
    }

    const product = await SanPham.findOne({ "variants._id": id_thuoc_tinh });
    if (!product) {
      return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại!" });
    }

    const variant = product.variants.find((v) => v._id.toString() === id_thuoc_tinh);
    if (!variant) {
      return res.status(404).json({ success: false, message: "Biến thể không tồn tại!" });
    }

    if (variant.so_luong < so_luong) {
      return res.status(400).json({ success: false, message: `Chỉ còn ${variant.so_luong} sản phẩm trong kho!` });
    }

    let cart = await GioHang.findOne({ id_customer });
    if (!cart) {
      cart = new GioHang({ id_customer, items: [] });
    }

    const existingItem = cart.items.find((item) => item.id_thuoc_tinh.toString() === id_thuoc_tinh);
    if (existingItem) {
      existingItem.so_luong += so_luong;
    } else {
      cart.items.push({ id_thuoc_tinh, so_luong, gia });
    }

    await cart.save();
    res.json({ success: true, message: "Thêm vào giỏ hàng thành công!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

router.get("/get", async (req, res) => {
  const id_customer = req.query.id_customer;
  if (!id_customer) {
    return res.status(400).json({ success: false, message: "Yêu cầu id_customer!" });
  }
  try {
    const cart = await GioHang.findOne({ id_customer }).populate("items.id_thuoc_tinh", "sku gia gia_km so_luong hinh_chinh");
    if (!cart) {
      return res.json({ success: true, data: { items: [] } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

router.post("/update", async (req, res) => {
  const { id_customer, id_thuoc_tinh, so_luong, action } = req.body;
  if (!id_customer || !id_thuoc_tinh || !action) {
    return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ!" });
  }
  try {
    const cart = await GioHang.findOne({ id_customer });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Giỏ hàng không tồn tại!" });
    }

    const itemIndex = cart.items.findIndex((item) => item.id_thuoc_tinh.toString() === id_thuoc_tinh);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại trong giỏ hàng!" });
    }

    const product = await SanPham.findOne({ "variants._id": id_thuoc_tinh });
    const variant = product.variants.find((v) => v._id.toString() === id_thuoc_tinh);
    if (!variant) {
      return res.status(404).json({ success: false, message: "Biến thể không tồn tại!" });
    }

    if (action === "increase") {
      if (variant.so_luong < cart.items[itemIndex].so_luong + 1) {
        return res.status(400).json({ success: false, message: `Chỉ còn ${variant.so_luong} sản phẩm trong kho!` });
      }
      cart.items[itemIndex].so_luong += 1;
    } else if (action === "decrease") {
      cart.items[itemIndex].so_luong = Math.max(1, cart.items[itemIndex].so_luong - 1);
    } else if (action === "delete") {
      cart.items.splice(itemIndex, 1);
    }

    await cart.save();
    res.json({ success: true, message: "Cập nhật giỏ hàng thành công!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

router.post("/clear", async (req, res) => {
  const { id_customer } = req.body;
  if (!id_customer) {
    return res.status(400).json({ success: false, message: "Yêu cầu id_customer!" });
  }
  try {
    const cart = await GioHang.findOneAndUpdate(
      { id_customer },
      { $set: { items: [] } },
      { new: true }
    );
    if (!cart) {
      return res.status(404).json({ success: false, message: "Giỏ hàng không tồn tại!" });
    }
    res.json({ success: true, message: "Xóa tất cả giỏ hàng thành công!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

module.exports = router;