// models/schemaGioHang.js
const mongoose = require("mongoose");

const gioHangSchema = new mongoose.Schema({
  id_customer: { type: mongoose.Schema.Types.ObjectId, ref: "nguoi_dung", required: true, unique: true },
  items: [
    {
      id_thuoc_tinh: { type: mongoose.Schema.Types.ObjectId, ref: "san_pham.variants", required: true },
      so_luong: { type: Number, required: true, default: 1 },
      gia: { type: Number, required: true },
      ten_sp: { type: String, required: true },
      thuong_hieu: { type: String, required: true },
      hinh_chinh: { type: String },
    },
  ],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, { collection: 'gio_hang' });

module.exports = gioHangSchema;