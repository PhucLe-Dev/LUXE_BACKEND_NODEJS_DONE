const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const router = express.Router();

// Import các file cần thiết
const middlewaresController = require('../controller/middlewaresController');
const NguoiDung = mongoose.model('nguoi_dung');

// ======================================================
// 1. Lấy danh sách người dùng (có phân trang, tìm kiếm, lọc)
// GET /api/admin/users
// ======================================================
router.get('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '', // Tìm kiếm theo sđt, email, họ tên
            vai_tro = '' // Lọc theo vai trò
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        // Xử lý tìm kiếm
        if (search) {
            query.$or = [
                { so_dien_thoai: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { ho_ten: { $regex: search, $options: 'i' } }
            ];
        }

        // Xử lý lọc theo vai trò
        if (vai_tro) {
            // Đảm bảo vai trò hợp lệ
            const validRoles = ['admin', 'shipper', 'khach_hang'];
            if (validRoles.includes(vai_tro)) {
                query.vai_tro = vai_tro;
            }
        }

        const users = await NguoiDung.find(query)
            .select('-mat_khau') // Loại bỏ trường mật khẩu khỏi kết quả trả về
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalUsers = await NguoiDung.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / parseInt(limit));

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                currentPage: parseInt(page),
                limit: parseInt(limit),
                totalUsers,
                totalPages
            }
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách người dùng:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách người dùng.' });
    }
});

// ======================================================
// 2. Thêm người dùng mới
// POST /api/admin/users
// ======================================================
router.post('/', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { ho_ten, email, mat_khau, so_dien_thoai, dia_chi, vai_tro } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!ho_ten || !email || !mat_khau || !vai_tro) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ họ tên, email, mật khẩu và vai trò.' });
        }

        // Kiểm tra email đã tồn tại chưa
        const existingUser = await NguoiDung.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email này đã được sử dụng.' });
        }

        // Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(mat_khau, salt);

        const newUser = new NguoiDung({
            ho_ten,
            email,
            mat_khau: hashedPassword,
            so_dien_thoai,
            dia_chi,
            vai_tro,
            trang_thai: true // Mặc định tài khoản được tạo bởi admin sẽ được kích hoạt
        });

        const savedUser = await newUser.save();

        // Loại bỏ mật khẩu trước khi gửi về client
        const userResponse = savedUser.toObject();
        delete userResponse.mat_khau;

        res.status(201).json({ success: true, message: 'Tạo người dùng thành công.', data: userResponse });

    } catch (error) {
        console.error("Lỗi khi thêm người dùng:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm người dùng.' });
    }
});

// ======================================================
// 3. Lấy chi tiết một người dùng
// GET /api/admin/users/:id
// ======================================================
router.get('/:id', middlewaresController.verifyToken, middlewaresController.verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
        }

        const user = await NguoiDung.findById(id).select('-mat_khau').lean();

        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }

        res.status(200).json({ success: true, data: user });

    } catch (error) {
        console.error("Lỗi khi lấy chi tiết người dùng:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy chi tiết người dùng.' });
    }
});


module.exports = router;
