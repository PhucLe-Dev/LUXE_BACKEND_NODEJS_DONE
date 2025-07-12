const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const NguoiDung = mongoose.model('nguoi_dung', require('../model/schemaNguoiDung'));

router.put('/:id', async (req, res) => {
  try {
    const updatedUser = await NguoiDung.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updated_at: Date.now()
      },
      { new: true }
    );
    res.json(updatedUser);
  } catch (error) {
    console.error("Lỗi khi cập nhật người dùng:", error);
    res.status(500).json({ error: 'Cập nhật thất bại' });
  }
});

module.exports = router;