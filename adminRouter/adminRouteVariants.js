const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const middlewaresController = require('../controller/middlewaresController');
const SanPham = mongoose.model('san_pham'); // Chúng ta sẽ thao tác thông qua model SanPham

// ======================================================
// 1. Lấy tất cả biến thể của một sản phẩm
// GET /api/admin/products/:productId/variants
// ======================================================
router.get('/:productId/variants', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await SanPham.findOne({ id: productId }).select('variants').lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    res.status(200).json({ success: true, data: product.variants });

  } catch (error) {
    console.error("Lỗi khi lấy danh sách biến thể sản phẩm:", error);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// ======================================================
// 2. Lấy chi tiết một biến thể của một sản phẩm
// GET /api/admin/products/:productId/variants/:variantId
// ======================================================
router.get('/:productId/variants/:variantId', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    const product = await SanPham.findOne({ id: productId }).lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    const variant = product.variants.find(v => v._id.toString() === variantId);

    if (!variant) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy biến thể sản phẩm.' });
    }

    res.status(200).json({ success: true, data: variant });

  } catch (error) {
    console.error("Lỗi khi lấy chi tiết biến thể sản phẩm:", error);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});


// ======================================================
// 3. Thêm một biến thể mới vào sản phẩm
// POST /api/admin/products/:productId/variants
// ======================================================
router.post('/:productId/variants', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
  try {
    const { productId } = req.params;
    const newVariantData = req.body; // Dữ liệu của biến thể mới

    if (!newVariantData.sku || !newVariantData.kich_thuoc || !newVariantData.mau_sac || newVariantData.gia === undefined) {
      return res.status(400).json({ success: false, message: 'SKU, kích thước, màu sắc và giá của biến thể là bắt buộc.' });
    }

    // Kiểm tra xem SKU đã tồn tại trong bất kỳ sản phẩm nào khác chưa
    const existingProductWithSku = await SanPham.findOne({ 'variants.sku': newVariantData.sku });
    if (existingProductWithSku) {
      return res.status(400).json({ success: false, message: `SKU '${newVariantData.sku}' đã tồn tại trong sản phẩm khác.` });
    }

    // Kiểm tra giá không âm và tính phan_tram_km
    if (newVariantData.gia < 0 || (newVariantData.gia_km !== null && newVariantData.gia_km < 0)) {
      return res.status(400).json({ success: false, message: 'Giá và giá khuyến mãi của biến thể không được âm.' });
    }
    if (newVariantData.gia_km !== null && newVariantData.gia_km > 0 && newVariantData.gia > 0) {
      newVariantData.phan_tram_km = Math.round(((newVariantData.gia - newVariantData.gia_km) / newVariantData.gia) * 100);
    } else {
      newVariantData.phan_tram_km = 0;
    }

    const updatedProduct = await SanPham.findOneAndUpdate(
      { id: productId },
      { $push: { variants: newVariantData }, updated_at: Date.now() }, // Thêm biến thể mới vào mảng
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm để thêm biến thể.' });
    }

    // Trả về biến thể vừa được thêm (có _id)
    const addedVariant = updatedProduct.variants.find(v => v.sku === newVariantData.sku);
    res.status(201).json({ success: true, message: 'Thêm biến thể thành công.', data: addedVariant });

  } catch (error) {
    console.error("Lỗi khi thêm biến thể sản phẩm:", error);
    if (error.code === 11000) { // Lỗi duplicate key, có thể do SKU trùng
      return res.status(400).json({ success: false, message: 'SKU biến thể đã tồn tại.' });
    }
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// ======================================================
// 4. Cập nhật một biến thể cụ thể của một sản phẩm
// PUT /api/admin/products/:productId/variants/:variantId
// ======================================================
router.put('/:productId/variants/:variantId', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const updateVariantData = req.body;

    if (updateVariantData.sku) { // Nếu có thay đổi SKU, cần kiểm tra trùng lặp
      const existingProductWithSku = await SanPham.findOne({
        id: { $ne: productId }, // Loại trừ sản phẩm hiện tại
        'variants.sku': updateVariantData.sku
      });
      if (existingProductWithSku) {
        return res.status(400).json({ success: false, message: `SKU '${updateVariantData.sku}' đã tồn tại trong sản phẩm khác.` });
      }
      // Cũng kiểm tra SKU có bị trùng với các variant khác TRONG CÙNG SẢN PHẨM không
      const product = await SanPham.findOne({ id: productId });
      if (product && product.variants.some(v => v.sku === updateVariantData.sku && v._id.toString() !== variantId)) {
        return res.status(400).json({ success: false, message: `SKU '${updateVariantData.sku}' đã tồn tại trong một biến thể khác của cùng sản phẩm này.` });
      }
    }

    // Tính lại phan_tram_km nếu giá thay đổi
    if ((updateVariantData.gia_km !== undefined && updateVariantData.gia !== undefined) ||
      (updateVariantData.gia_km !== undefined && updateVariantData.gia === undefined) ||
      (updateVariantData.gia_km === undefined && updateVariantData.gia !== undefined)
    ) {
      const currentProduct = await SanPham.findOne({ id: productId });
      const currentVariant = currentProduct ? currentProduct.variants.id(variantId) : null;

      if (currentVariant) {
        const effectiveGia = updateVariantData.gia !== undefined ? updateVariantData.gia : currentVariant.gia;
        const effectiveGiaKm = updateVariantData.gia_km !== undefined ? updateVariantData.gia_km : currentVariant.gia_km;

        if (effectiveGia < 0 || (effectiveGiaKm !== null && effectiveGiaKm < 0)) {
          return res.status(400).json({ success: false, message: 'Giá và giá khuyến mãi của biến thể không được âm.' });
        }
        if (effectiveGiaKm !== null && effectiveGiaKm > 0 && effectiveGia > 0) {
          updateVariantData.phan_tram_km = Math.round(((effectiveGia - effectiveGiaKm) / effectiveGia) * 100);
        } else {
          updateVariantData.phan_tram_km = 0;
        }
      }
    }

    // Cập nhật biến thể cụ thể bằng findOneAndUpdate với positional operator $
    const updatedProduct = await SanPham.findOneAndUpdate(
      { id: productId, 'variants._id': variantId },
      {
        $set: {
          'variants.$': updateVariantData, // Cập nhật toàn bộ sub-document
          updated_at: Date.now() // Cập nhật thời gian của sản phẩm cha
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm hoặc biến thể để cập nhật.' });
    }

    const updatedVariant = updatedProduct.variants.id(variantId); // Lấy biến thể đã cập nhật
    res.status(200).json({ success: true, message: 'Cập nhật biến thể thành công.', data: updatedVariant });

  } catch (error) {
    console.error("Lỗi khi cập nhật biến thể sản phẩm:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'SKU biến thể đã tồn tại.' });
    }
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// ======================================================
// 5. Xóa một biến thể cụ thể của một sản phẩm
// DELETE /api/admin/products/:productId/variants/:variantId
// ======================================================
router.delete('/:productId/variants/:variantId', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    // Cần đảm bảo không xóa tất cả variants của sản phẩm
    const product = await SanPham.findOne({ id: productId }).select('variants');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }
    if (product.variants.length === 1 && product.variants[0]._id.toString() === variantId) {
      return res.status(400).json({ success: false, message: 'Không thể xóa biến thể cuối cùng của sản phẩm. Sản phẩm phải có ít nhất một biến thể.' });
    }

    const updatedProduct = await SanPham.findOneAndUpdate(
      { id: productId },
      {
        $pull: { variants: { _id: variantId } }, // Xóa biến thể khỏi mảng
        updated_at: Date.now()
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm hoặc biến thể để xóa.' });
    }

    res.status(200).json({ success: true, message: 'Xóa biến thể thành công.' });

  } catch (error) {
    console.error("Lỗi khi xóa biến thể sản phẩm:", error);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

module.exports = router;