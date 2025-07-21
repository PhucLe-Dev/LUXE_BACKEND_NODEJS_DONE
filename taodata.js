const { v4: uuidv4 } = require('uuid');
const slugify = require('slugify');
require('dotenv').config();
const mongoose = require('mongoose');
const { makeSku } = require('./utils/generate');

// Import các schema
const LoaiSanPham = require('./model/schemaLoaiSanPham');
const ThuongHieu = require('./model/schemaThuongHieu');
const SanPham = require('./model/schemaSanPham');
const NguoiDung = require('./model/schemaNguoiDung');
const DonHang = require('./model/schemaDonHang');
const BinhLuan = require('./model/schemaBinhLuan');
const Voucher = require('./model/schemaVoucher');
const DiaChiModel = require('./model/schemaDiaChi');
const DanhGiaModel = require('./model/schemaDanhGia');
const SanPhamYeuThich = require('./model/schemaSanPhamYeuThich')

// Import dữ liệu mẫu
const {
  loai_arr,
  thuong_hieu_arr,
  sp_arr,
  nguoi_dung_arr,
  voucher_arr,
  don_hang_arr,
  binh_luan_arr,
  dia_chi_arr,
  danh_gia_arr,
  san_pham_yeu_thich,
} = require('./data');

// Hàm sinh ngẫu nhiên
let randomCreate = function (low, high) {
  return Math.floor(Math.random() * (high - low) + low);
};

// Hàm chèn danh mục
const chen_loai = async () => {
  const LoaiSanPhamModel = mongoose.model('loai_san_pham', LoaiSanPham);
  await LoaiSanPhamModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} danh mục`));
  for (let loai of loai_arr) {
    let newLoai = new LoaiSanPhamModel(loai);
    await newLoai.save();
  }
  console.log('Chèn danh mục thành công');
};

// Hàm chèn thương hiệu
const chen_thuong_hieu = async () => {
  const ThuongHieuModel = mongoose.model('thuong_hieu', ThuongHieu);
  await ThuongHieuModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} thương hiệu`));
  for (let thuongHieu of thuong_hieu_arr) {
    let newThuongHieu = new ThuongHieuModel(thuongHieu);
    await newThuongHieu.save();
  }
  console.log('Chèn thương hiệu thành công');
};

// Hàm chèn sản phẩm
const chen_sp = async () => {
  const SanPhamModel = mongoose.model('san_pham', SanPham);
  await SanPhamModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} sản phẩm`));

  for (let sp of sp_arr) {

    sp.luot_xem = randomCreate(1, 2000);
    let ngay = randomCreate(2023, 2026) + "-" + randomCreate(1, 13) + "-" + randomCreate(1, 29);
    let gio = randomCreate(0, 24) + ":" + randomCreate(0, 60) + ":" + randomCreate(0, 60);
    console.log(ngay + " " + gio);
    sp.created_at = ngay + " " + gio;
    sp.updated_at = ngay + " " + gio;
    sp.slug = slugify(sp.ten_sp, { lower: true, strict: true }) + "-" + sp._id;
    for (let variant of sp.variants) {
      try {
        variant.sku = await makeSku(sp.ten_sp, variant.kich_thuoc, variant.mau_sac);
        variant.so_luong = randomCreate(29, 30);
        variant.so_luong_da_ban = randomCreate(1, 28);
        // Tính phần trăm giảm giá và làm tròn xuống
        if (variant.gia_km != null && variant.gia_km > 0 && variant.gia_km < variant.gia) {
          variant.phan_tram_km = Math.floor((variant.gia - variant.gia_km) / variant.gia * 100);
        } else {
          variant.phan_tram_km = 0;
        }

      } catch (error) {
        console.error(`Lỗi khi tạo SKU cho sản phẩm ${sp.ten_sp}:`, error.message);
        return;
      }
    }

    let newSp = new SanPhamModel(sp);
    try {
      await newSp.save();
    } catch (error) {
      console.error(`Lỗi khi chèn sản phẩm ${sp.ten_sp}:`, error.message);
    }
  }
  console.log('Chèn sản phẩm thành công');
};

// Hàm chèn người dùng
const chen_nguoi_dung = async () => {
  const NguoiDungModel = mongoose.model('nguoi_dung', NguoiDung);
  await NguoiDungModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} người dùng`));
  for (let nguoiDung of nguoi_dung_arr) {
    let newNguoiDung = new NguoiDungModel(nguoiDung);
    await newNguoiDung.save();
  }
  console.log('Chèn người dùng thành công');
};

// Hàm chèn voucher
const chen_voucher = async () => {
  const VoucherModel = mongoose.model('voucher', Voucher);
  await VoucherModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} voucher`));
  for (let voucher of voucher_arr) {
    let newVoucher = new VoucherModel(voucher);
    await newVoucher.save();
  }
  console.log('Chèn voucher thành công');
};

// Hàm chèn đơn hàng
const chen_don_hang = async () => {
  const DonHangModel = mongoose.model('don_hang', DonHang);
  await DonHangModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} đơn hàng`));
  for (let donHang of don_hang_arr) {
    let newDonHang = new DonHangModel(donHang);
    await newDonHang.save();
  }
  console.log('Chèn đơn hàng thành công');
};

// Hàm chèn bình luận
const chen_binh_luan = async () => {
  const BinhLuanModel = mongoose.model('binh_luan', BinhLuan);
  await BinhLuanModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} bình luận`));
  for (let binhLuan of binh_luan_arr) {
    let newBinhLuan = new BinhLuanModel(binhLuan);
    await newBinhLuan.save();
  }
  console.log('Chèn bình luận thành công');
};

// Hàm chèn địa chỉ
const chen_dia_chi = async () => {
  await DiaChiModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} địa chỉ`));
  for (let diaChi of dia_chi_arr) {
    let newDiaChi = new DiaChiModel(diaChi);
    await newDiaChi.save();
  }
  console.log('Chèn địa chỉ thành công');
};

// Hàm chèn đánh giá
const chen_danh_gia = async () => {
  await DanhGiaModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} đánh giá`));
  for (let danhGia of danh_gia_arr) {
    let newDanhGia = new DanhGiaModel(danhGia);
    await newDanhGia.save();
  }
  console.log('Chèn đánh giá thành công');
};

// Hàm chèn sản phẩm yêu thích
const chen_san_pham_yeu_thich = async () => {
  const SanPhamYeuThichModel = mongoose.model('san_pham_yeu_thich', SanPhamYeuThich);
  await SanPhamYeuThichModel.deleteMany({}).then(obj => console.log(`Đã xóa ${obj.deletedCount} sản phẩm yêu thích`));
  for (let sanPhamYeuThich of san_pham_yeu_thich) {
    let newSanPhamYeuThich = new SanPhamYeuThichModel(sanPhamYeuThich);
    await newSanPhamYeuThich.save();
  }
  console.log('Chèn sản phẩm yêu thích thành công');
};

(async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("✅ Đã kết nối MongoDB");

    // 👇 Sau khi kết nối xong mới chạy các hàm chèn dữ liệu:
    await chen_loai();
    await chen_thuong_hieu();
    await chen_sp();
    await chen_nguoi_dung();
    await chen_voucher();
    await chen_don_hang();
    await chen_binh_luan();
    await chen_dia_chi();
    await chen_danh_gia();
    await chen_san_pham_yeu_thich();

    console.log("🎉 Hoàn tất chèn dữ liệu!");
    process.exit();
  } catch (error) {
    console.error("❌ Lỗi kết nối MongoDB:", error.message);
    process.exit(1);
  }
})();