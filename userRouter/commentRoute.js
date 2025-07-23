const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Comment = mongoose.model('binh_luan', require('../model/schemaBinhLuan'));

// Lấy comment có phân trang
router.get('/:productId', async (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const comments = await Comment.find({ id_san_pham: req.params.productId, parent_id: null, an_hien: true })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('id_customer', 'ho_ten avatar email')
    .lean();

  const replies = await Comment.find({ id_san_pham: req.params.productId, parent_id: { $ne: null }, an_hien: true })
    .populate('id_customer', 'ho_ten avatar email')
    .lean();

  const total = await Comment.countDocuments({ id_san_pham: req.params.productId, parent_id: null, an_hien: true });
  const totalPages = Math.ceil(total / parseInt(limit));

  res.json({ success: true, data: { comments, replies, totalPages } });
});


// Thêm bình luận
router.post("/", async (req, res) => {
  try {
    const { id_san_pham, id_customer, noi_dung, parent_id = null } = req.body;
    const newComment = await Comment.create({ id_san_pham, id_customer, noi_dung, parent_id });
    const populated = await Comment.findById(newComment._id).populate("id_customer", "ho_ten avatar email");

    req.io.emit("newComment", populated); // ✅ Emit bình luận mới
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi khi tạo bình luận" });
  }
});

// Sửa bình luận
router.put("/:id", async (req, res) => {
  try {
    const { noi_dung, id_customer } = req.body;
    const updated = await Comment.findOneAndUpdate(
      { _id: req.params.id, id_customer },
      { noi_dung },
      { new: true }
    ).populate("id_customer", "ho_ten avatar");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hoặc không có quyền." });
    }

    req.io.emit("commentEdited", updated); // ✅ Emit bình luận đã sửa
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server khi sửa bình luận" });
  }
});

// Xóa bình luận
router.delete("/:id", async (req, res) => {
  try {
    const { id_customer } = req.body;
    const deleted = await Comment.findOneAndDelete({ _id: req.params.id, id_customer });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hoặc không có quyền." });
    }

    req.io.emit("commentDeleted", deleted._id); // ✅ Emit ID đã xóa
    res.json({ success: true, message: "Đã xóa bình luận" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server khi xóa bình luận" });
  }
});

module.exports = router;
