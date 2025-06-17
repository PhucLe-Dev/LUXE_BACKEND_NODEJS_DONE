const mongoose = require('mongoose');

const nguoiDungSchema = new mongoose.Schema({
  ho_ten: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  mat_khau: { type: String, required: function() { return this.loginType !== 'google' && this.loginType !== 'facebook'; } },
  so_dien_thoai: { type: String, default: '' },
  avatar: { type: String, default: '' },
  dia_chi: { type: String, default: '' },
  vai_tro: { type: String, enum: ['khach_hang', 'admin', 'shipper'], default: 'khach_hang' },
  ngay_thang_nam_sinh: { type: Date, default: '' },
  gioi_tinh: { type: String, enum: ['nam', 'nữ', 'khác'], default: 'khác' },
  trang_thai: { type: Boolean, default: false },
  googleId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },
  loginType: { type: String, enum: ['form', 'google', 'facebook'], default: 'form' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'nguoi_dung' });

module.exports = nguoiDungSchema;