const mongoose = require('mongoose');

// Định nghĩa schema cho người dùng
const nguoiDungSchema = new mongoose.Schema({
  ho_ten: { type: String, unique: true, required: true }, // Họ tên (duy nhất)
  email: { type: String, unique: true, required: true }, // Email (duy nhất)
  mat_khau: { type: String, required: true }, // Mật khẩu (mã hóa)
  so_dien_thoai: { type: String, default: '' }, // Số điện thoại
  avatar: { type: String, default: '' }, // Hình ảnh đại diện
  dia_chi: { type: String, default: '' }, // Địa chỉ mặc định
  vai_tro: { type: String, enum: ['khach_hang', 'admin', 'shipper'], default: 'khach_hang' }, // Vai trò
  trang_thai: { type: Boolean, default: false }, // Trạng thái tài khoản
  created_at: { type: Date, default: Date.now }, // Thời gian tạo
  updated_at: { type: Date, default: Date.now } // Thời gian cập nhật
}, { collection: 'nguoi_dung' });

// Export model
module.exports = nguoiDungSchema;