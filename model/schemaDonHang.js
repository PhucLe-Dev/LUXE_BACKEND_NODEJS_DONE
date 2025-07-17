const mongoose = require('mongoose');

const orderItems = new mongoose.Schema({
  id_variant: { type: mongoose.Schema.Types.ObjectId, ref: 'san_pham.variants', required: true }, // Tham chiếu biến thể
  so_luong: { type: Number, min: 1, required: true }, // Số lượng
  gia: { type: Number, min: 0, required: true }, // Giá tại thời điểm mua
  da_danh_gia: { type: Boolean, default: false }
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
  phuong_thuc_thanh_toan: { type: String, enum: ['COD', 'VNPay', 'Momo'], required: true }, // Phương thức thanh toán
  trang_thai_thanh_toan: { type: String, enum: ['Chưa thanh toán', 'Đã thanh toán'], required: true }, // Trạng thái thanh toán
  trang_thai_don_hang: { type: String, enum: ['Chờ xác nhận', 'Đã xác nhận', 'Shipper đã nhận hàng', 'Đang giao', 'Đã giao', 'Giao hàng thành công', 'Giao hàng thất bại', 'Hủy đơn hàng'], default: 'Chờ xác nhận' },
  ghi_chu: { type: String, default: '' }, // Ghi chú
  ma_giao_dich: {type: String, default: null},
  created_at: { type: Date, default: Date.now }, // Thời gian tạo
  updated_at: { type: Date, default: Date.now } // Thời gian cập nhật
}, { collection: 'don_hang' });

// Middleware để cập nhật updated_at
donHangSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Middleware để cập nhật updated_at
donHangSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Middleware để xử lý thay đổi trạng thái đơn hàng
donHangSchema.pre('save', async function (next) {
  try {
    const SanPham = mongoose.model('san_pham');
    
    // Kiểm tra xem có phải là cập nhật trạng thái không
    if (this.isModified('trang_thai_don_hang')) {
      const trangThaiCu = this.getUpdate ? this.getUpdate().$set?.trang_thai_don_hang : undefined;
      const trangThaiMoi = this.trang_thai_don_hang;
      
      // Lấy trạng thái cũ từ database nếu đây là update
      let trangThaiCuFromDB = null;
      if (this.isNew === false) {
        const oldOrder = await mongoose.model('don_hang').findById(this._id);
        trangThaiCuFromDB = oldOrder?.trang_thai_don_hang;
      }
      
      const trangThaiCuActual = trangThaiCuFromDB || trangThaiCu;
      
      // Xử lý logic cập nhật số lượng
      await updateInventory(this.variants, trangThaiCuActual, trangThaiMoi, SanPham);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware cho findOneAndUpdate
donHangSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const SanPham = mongoose.model('san_pham');
    const update = this.getUpdate();
    
    if (update.$set && update.$set.trang_thai_don_hang) {
      // Lấy document hiện tại
      const currentDoc = await this.model.findOne(this.getQuery());
      if (currentDoc) {
        const trangThaiCu = currentDoc.trang_thai_don_hang;
        const trangThaiMoi = update.$set.trang_thai_don_hang;
        
        // Xử lý logic cập nhật số lượng
        await updateInventory(currentDoc.variants, trangThaiCu, trangThaiMoi, SanPham);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Hàm helper để cập nhật inventory
async function updateInventory(variants, trangThaiCu, trangThaiMoi, SanPham) {
  const trangThaiTruSoLuong = ['Đã xác nhận', 'Shipper đã nhận hàng', 'Đang giao', 'Đã giao', 'Giao hàng thành công'];
  const trangThaiCongSoLuong = ['Hủy đơn hàng', 'Trả hàng và hoàn tiền', 'Giao hàng thất bại'];
  
  for (const variant of variants) {
    const soLuongMua = variant.so_luong;
    let soLuongChange = 0;
    let soLuongDaBanChange = 0;
    
    // Logic xác định thay đổi số lượng
    const oldStatusTruSoLuong = trangThaiTruSoLuong.includes(trangThaiCu);
    const newStatusTruSoLuong = trangThaiTruSoLuong.includes(trangThaiMoi);
    
    if (!oldStatusTruSoLuong && newStatusTruSoLuong) {
      // Chuyển từ trạng thái chưa trừ sang trạng thái trừ số lượng
      soLuongChange = -soLuongMua;
      soLuongDaBanChange = soLuongMua;
    } else if (oldStatusTruSoLuong && !newStatusTruSoLuong) {
      // Chuyển từ trạng thái đã trừ sang trạng thái chưa trừ (hủy, thất bại)
      soLuongChange = soLuongMua;
      soLuongDaBanChange = -soLuongMua;
    }
    
    // Cập nhật database
    if (soLuongChange !== 0 || soLuongDaBanChange !== 0) {
      await SanPham.updateOne(
        { 'variants._id': variant.id_variant },
        {
          $inc: {
            'variants.$.so_luong': soLuongChange,
            'variants.$.so_luong_da_ban': soLuongDaBanChange
          }
        }
      );
    }
  }
}

// Export model
module.exports = donHangSchema;