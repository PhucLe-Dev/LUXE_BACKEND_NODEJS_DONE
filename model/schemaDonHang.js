const mongoose = require('mongoose');

const orderItems = new mongoose.Schema({
  id_variant: { type: mongoose.Schema.Types.ObjectId, ref: 'san_pham.variants', required: true }, // Tham chiếu biến thể
  so_luong: { type: Number, min: 1, required: true }, // Số lượng
  gia: { type: Number, min: 0, required: true } // Giá tại thời điểm mua
});

// Định nghĩa schema cho đơn hàng
const donHangSchema = new mongoose.Schema({
  id_customer: { type: mongoose.Schema.Types.ObjectId, ref: 'nguoi_dung', required: true }, // Tham chiếu khách hàng
  id_shipper: { type: mongoose.Schema.Types.ObjectId, ref: 'nguoi_dung', required: false }, // Tham chiếu shipper
  id_voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'voucher', default: null }, // Tham chiếu voucher
  ma_don_hang: { type: String, unique: true, required: true }, // Mã đơn hàng (ví dụ: "DH001")
  variants: [orderItems],
  tong_tien: { type: Number, min: 0, required: true }, // Tổng tiền
  ho_ten: { type: String, required: true },
  email: { type: String, required: true },
  sdt: { type: String, default: '' },
  dia_chi_giao_hang: { type: String, required: true }, // Địa chỉ giao
  phuong_thuc_thanh_toan: { type: String, enum: ['COD', 'VNPay'], required: true }, // Phương thức thanh toán
  trang_thai_thanh_toan: { type: String, enum: ['Chưa thanh toán', 'Đã thanh toán'], required: true }, // Trạng thái thanh toán
  trang_thai_don_hang: { type: String, enum: ['Chờ xác nhận', 'Đã xác nhận', 'Shipper đã nhận hàng', 'Đang giao', 'Đã giao', 'Giao hàng thành công', 'Giao hàng thất bại', 'Hủy đơn hàng', 'Trả hàng và hoàn tiền'], default: 'Chờ xác nhận' },
  ghi_chu: { type: String, default: '' }, // Ghi chú
  created_at: { type: Date, default: Date.now }, // Thời gian tạo
  updated_at: { type: Date, default: Date.now } // Thời gian cập nhật
}, { collection: 'don_hang' });

// Middleware để cập nhật updated_at
donHangSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Export model
module.exports = donHangSchema;