// utils/generate.js
const slugify  = require('slugify');
const crypto   = require('crypto');
const mongoose = require('mongoose');

// Vì SanPhamModel có thể chưa được định nghĩa khi file này được import lần đầu,
// chúng ta sẽ lấy model trực tiếp từ mongoose.models nếu đã tồn tại,
// hoặc định nghĩa lại nếu cần (đảm bảo schemaSanPham đã được require ở đâu đó trước đó)
// Cách an toàn hơn là SanPhamModel được truyền vào hàm makeSlug nếu cần kiểm tra uniqueness
// hoặc đảm bảo nó đã được định nghĩa toàn cục trước khi generate.js được chạy.
// Hiện tại, SanPhamModel được require trong adminRouteSanPhamPhucDev,
// nên mongoose.model('san_pham', schemaSanPham) sẽ hoạt động nếu schema đã được đăng ký.

// Đây là cách an toàn hơn để đảm bảo SanPhamModel có sẵn
let SanPhamModel;
try {
  SanPhamModel = mongoose.model('san_pham');
} catch (error) {
  // Nếu model chưa được tạo, tạo nó
  SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));
}


exports.makeSlug = async (name, model) => {
  const baseSlug = slugify(name, { lower: true, strict: true });
  let uniqueSlug = baseSlug;
  let counter = 1;

  // Kiểm tra tính duy nhất của slug trong database
  // Chỉ kiểm tra nếu model được cung cấp (tức là khi tạo/cập nhật sản phẩm)
  if (model) {
    while (await model.exists({ slug: uniqueSlug })) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
  return uniqueSlug;
};

// Hàm tạo SKU có tham số và trả về Promise của một chuỗi SKU
exports.makeSku = async (productName, size, color) => {
  // Chuẩn hóa chuỗi đầu vào để tạo một phần SKU có ý nghĩa
  const normalizedProductName = slugify(productName, { lower: true, strict: true }).substring(0, 8); // Lấy 8 ký tự đầu
  const normalizedSize = slugify(size, { lower: true, strict: true }).substring(0, 3); // Lấy 3 ký tự đầu
  const normalizedColor = slugify(color, { lower: true, strict: true }).substring(0, 4); // Lấy 4 ký tự đầu

  let sku = '';
  let exists = true;
  let attempt = 0;

  // Lặp cho đến khi tạo được một SKU duy nhất
  while (exists) {
    // Tạo một phần ngẫu nhiên để đảm bảo tính duy nhất
    const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 ký tự ngẫu nhiên

    // Kết hợp các phần để tạo SKU
    sku = `${normalizedProductName}-${normalizedSize}-${normalizedColor}-${randomPart}`;

    // Thêm số lần thử nếu có sự trùng lặp ban đầu
    if (attempt > 0) {
        sku = `${sku}-${attempt}`;
    }

    // Kiểm tra xem SKU đã tồn tại trong database chưa
    // Sử dụng SanPhamModel để kiểm tra trong tất cả các variants
    exists = await SanPhamModel.exists({ 'variants.sku': sku }); // [Fix] Ensure SanPhamModel is available here

    if (!exists) {
        return sku; // Trả về SKU nếu nó là duy nhất
    }
    attempt++;
    // Đặt giới hạn cho số lần thử để tránh vòng lặp vô hạn
    if (attempt > 100) {
        throw new Error('Không thể tạo SKU duy nhất sau 100 lần thử.');
    }
  }
};