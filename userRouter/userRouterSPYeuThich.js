const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import các schema và định nghĩa models
// Đảm bảo đường dẫn này đúng với cấu trúc thư mục của bạn
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));
const NguoiDungModel = mongoose.model('nguoi_dung', require('../model/schemaNguoiDung'));
const SanPhamYeuThichModel = mongoose.model('san_pham_yeu_thich', require('../model/schemaSanPhamYeuThich'));

// Middleware xác thực người dùng dựa trên header 'x-user-id'
const authenticateUser = (req, res, next) => {
    const userId = req.headers['x-user-id']; // Lấy userId từ header x-user-id
    if (!userId) {
        return res.status(401).json({ message: 'Người dùng chưa xác thực.' });
    }
    req.userId = userId;
    next();
};

// API: Thêm sản phẩm vào danh sách yêu thích
router.post('/them', authenticateUser, async (req, res) => {
    const { id_san_pham } = req.body;
    const id_nguoi_dung = req.userId; // Lấy từ middleware xác thực

    if (!id_san_pham) {
        return res.status(400).json({ message: 'Thiếu ID sản phẩm.' });
    }

    try {
        const sanPhamExists = await SanPhamModel.findById(id_san_pham);
        const nguoiDungExists = await NguoiDungModel.findById(id_nguoi_dung);

        if (!sanPhamExists) {
            return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
        }
        if (!nguoiDungExists) {
            return res.status(404).json({ message: 'Người dùng không tồn tại.' });
        }

        const sanPhamYeuThichMoi = new SanPhamYeuThichModel({
            id_nguoi_dung: id_nguoi_dung,
            id_san_pham: id_san_pham,
        });

        await sanPhamYeuThichMoi.save();
        res.status(201).json({ message: 'Sản phẩm đã được thêm vào danh sách yêu thích.', sanPhamYeuThich: sanPhamYeuThichMoi });

    } catch (error) {
        if (error.code === 11000) { // Lỗi trùng lặp key (do unique index)
            return res.status(409).json({ message: 'Sản phẩm đã có trong danh sách yêu thích của bạn.' });
        }
        console.error('Lỗi khi thêm sản phẩm yêu thích:', error);
        res.status(500).json({ message: 'Lỗi server nội bộ.' });
    }
});

// API: Xóa sản phẩm khỏi danh sách yêu thích
router.delete('/xoa/:id_san_pham', authenticateUser, async (req, res) => {
    const { id_san_pham } = req.params;
    const id_nguoi_dung = req.userId; // Lấy từ middleware xác thực

    try {
        const result = await SanPhamYeuThichModel.deleteOne({
            id_nguoi_dung: id_nguoi_dung,
            id_san_pham: id_san_pham
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Sản phẩm không có trong danh sách yêu thích của bạn hoặc không tìm thấy.' });
        }

        res.status(200).json({ message: 'Sản phẩm đã được xóa khỏi danh sách yêu thích.' });

    } catch (error) {
        console.error('Lỗi khi xóa sản phẩm yêu thích:', error);
        res.status(500).json({ message: 'Lỗi server nội bộ.' });
    }
});

// API: Lấy danh sách sản phẩm yêu thích của người dùng
router.get('/', authenticateUser, async (req, res) => {
    const id_nguoi_dung = req.userId; // Lấy từ middleware xác thực

    try {
        const danhSachYeuThich = await SanPhamYeuThichModel.aggregate([
            { $match: { id_nguoi_dung: new mongoose.Types.ObjectId(id_nguoi_dung) } },
            {
                $lookup: {
                    from: 'san_pham',
                    localField: 'id_san_pham',
                    foreignField: '_id',
                    as: 'san_pham',
                },
            },
            { $unwind: '$san_pham' },
            {
                $lookup: {
                    from: 'thuong_hieu',
                    localField: 'san_pham.id_thuong_hieu',
                    foreignField: 'id',
                    as: 'thuong_hieu',
                },
            },
            { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    'san_pham.thuong_hieu': '$thuong_hieu',
                },
            },
            {
                $project: {
                    _id: 1,
                    id_nguoi_dung: 1,
                    created_at: 1,
                    id_san_pham: '$san_pham',
                },
            },
        ]);


        res.status(200).json(danhSachYeuThich);

    } catch (error) {
        console.error('Lỗi khi lấy danh sách sản phẩm yêu thích:', error);
        res.status(500).json({ message: 'Lỗi server nội bộ.' });
    }
});

module.exports = router;