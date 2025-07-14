const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DanhGia = require('../model/schemaDanhGia');
const DonHang = mongoose.model('don_hang', require('../model/schemaDonHang'));

// Tạo review mới
router.post('/', async (req, res) => {
  try {
    const { userId, variantId, rating, content, orderId } = req.body;

    // 1. Kiểm tra đơn hàng tồn tại và đã giao thành công
    const order = await DonHang.findOne({
      _id: orderId,
      id_customer: userId,
      trang_thai_don_hang: 'Giao hàng thành công',
      'variants.id_variant': variantId
    });

    if (!order) {
      return res.status(400).json({ message: 'Không tìm thấy đơn hàng phù hợp để đánh giá.' });
    }

    // 2. Kiểm tra user đã đánh giá variant này chưa (1 lần/variant)
    const existing = await DanhGia.findOne({ id_customer: userId, id_variant: variantId });
    if (existing) {
      return res.status(400).json({ message: 'Bạn đã đánh giá biến thể này rồi.' });
    }

    // 3. Tạo review
    const newReview = new DanhGia({
      id_customer: userId,
      id_variant: variantId,
      orderId,
      rating,
      content
    });
    await newReview.save();

    // 4. Update trạng thái đã đánh giá trong DonHang
    await DonHang.updateOne(
      { _id: orderId, "variants.id_variant": variantId },
      { $set: { "variants.$.da_danh_gia": true } }
    );

    res.status(201).json({ "success": true, "message": "Đánh giá đã được gửi thành công!", review: newReview });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

//Lấy review theo variant với filter star, phân trang, tính average
router.get('/:variantId', async (req, res) => {
    try {
        const { variantId } = req.params;
        const { star, page = 1, limit = 10 } = req.query;

        const filter = { id_variant: variantId };
        if (star) {
            filter.rating = Number(star);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 1. Đếm tổng
        const totalReviews = await DanhGia.countDocuments(filter);

        // 2. Tính trung bình rating (aggregation)
        const avgResult = await DanhGia.aggregate([
            { $match: { id_variant: mongoose.Types.ObjectId(variantId) } },
            { $group: { _id: null, averageRating: { $avg: '$rating' } } }
        ]);

        const averageRating = avgResult.length > 0 ? avgResult[0].averageRating : 0;

        // 3. Lấy danh sách với phân trang
        const reviews = await DanhGia.find(filter)
            .populate('id_customer', 'name email ho_ten avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.json({
            averageRating,
            totalReviews,
            page: parseInt(page),
            limit: parseInt(limit),
            reviews
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
});

module.exports = router;
