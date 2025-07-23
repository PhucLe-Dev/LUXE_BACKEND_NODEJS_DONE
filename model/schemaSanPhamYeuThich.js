const mongoose = require('mongoose');

// Định nghĩa schema cho sản phẩm yêu thích
const sanPhamYeuThichSchema = new mongoose.Schema({
  id_nguoi_dung: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'nguoi_dung', // Tham chiếu đến model NguoiDung
    required: true
  },
  id_san_pham: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'san_pham', // Tham chiếu đến model SanPham
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, { collection: 'san_pham_yeu_thich' });

// Đảm bảo mỗi cặp người dùng-sản phẩm chỉ tồn tại một lần
sanPhamYeuThichSchema.index({ id_nguoi_dung: 1, id_san_pham: 1 }, { unique: true });

// Export model
module.exports = sanPhamYeuThichSchema;