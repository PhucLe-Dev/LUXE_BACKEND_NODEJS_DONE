const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DonHangSchema = require('../model/schemaDonHang');
const middlewaresController = require('../controller/middlewaresController');

// Route lấy tất cả đơn hàng
router.get('/get-all-orders', async (req, res) => {
    try {
        const donHang = await mongoose.model('don_hang', DonHangSchema).find().populate('id_customer', 'ho_ten email');
        res.status(200).json(donHang);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Route cập nhật trạng thái đơn hàng
router.put('/update-status/:id', async (req, res) => {
    try {
        const DonHang = mongoose.model('don_hang', DonHangSchema);
        const donHang = await DonHang.findById(req.params.id);

        if (!donHang) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

        const currentStatus = donHang.trang_thai_don_hang;
        let nextStatus;

        if (currentStatus === 'Đang giao') nextStatus = 'Đã giao';
        else if (currentStatus === 'Shipper đã nhận hàng') nextStatus = 'Đang giao';
        else if (currentStatus === 'Đã giao') nextStatus = 'Giao hàng thành công';
        else
            return res.status(400).json({ message: 'Không thể cập nhật trạng thái từ trạng thái hiện tại' });

        donHang.trang_thai_don_hang = nextStatus;
        donHang.updated_at = Date.now();
        await donHang.save();

        res.status(200).json({ message: 'Cập nhật trạng thái thành công', donHang });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái' });
    }
});

router.put('/cancel-order/:id', async (req, res) => {
    try {
        const DonHang = mongoose.model('don_hang', DonHangSchema);
        const donHang = await DonHang.findById(req.params.id);

        if (!donHang) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
        }

        if (donHang.trang_thai_don_hang !== 'Đang giao') {
            return res.status(400).json({ message: 'Chỉ có thể huỷ đơn hàng khi đang ở trạng thái "Đang giao"' });
        }

        donHang.trang_thai_don_hang = 'Hủy';
        donHang.updated_at = Date.now();
        await donHang.save();

        res.status(200).json({ message: 'Huỷ đơn hàng thành công', donHang });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server khi huỷ đơn hàng' });
    }
});

router.get('/get-my-orders', middlewaresController.verifyToken, async (req, res) => {
    try {
        const DonHang = mongoose.model('don_hang', DonHangSchema);

        const shipperId = req.user.id;

        const trangThaiFilter = [
            'Đang giao',
            'Đã giao',
            'Giao hàng thành công',
            'Giao hàng thất bại',
            'Hủy'
        ];

        const regexFilter = trangThaiFilter.map(tt => ({
            trang_thai_don_hang: { $regex: tt, $options: 'i' }
        }));

        const donHangList = await DonHang.find({
            id_shipper: new mongoose.Types.ObjectId(shipperId),
            $or: regexFilter
        }).populate('id_customer', 'ho_ten email');

        res.status(200).json(donHangList);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server khi lấy đơn hàng của shipper' });
    }
});

module.exports = router;
