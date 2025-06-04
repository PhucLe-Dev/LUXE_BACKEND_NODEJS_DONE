const mongoose = require('mongoose');
const jwt = require("jsonwebtoken")
const dotenv = require('dotenv');
dotenv.config();
const bcrypt = require('bcrypt');
const schemaNguoiDung = require('../model/schemaNguoiDung');
const conn = mongoose.createConnection(process.env.DATABASE_URL);
const User = conn.model('nguoi_dung', schemaNguoiDung);

const authControllers = {
    // Hàm tạo access token
    createAccessToken: (user) => {
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '30s' });
    },
    // Hàm tạo refresh token
    createRefreshToken: (user) => {
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: '1d' });
    },
    // Hàm đăng ký người dùng
    registerUser: async (req, res) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(req.body.mat_khau, salt);
            // Tạo user
            const newUser = await new User({
                ho_ten: req.body.ho_ten,
                email: req.body.email,
                mat_khau: hashedPassword,
                xac_nhan_mat_khau: req.body.mat_khau,
            });
            if (req.body.mat_khau !== req.body.xac_nhan_mat_khau) {
                return res.status(404).json({ message: 'Mật khẩu và mật khẩu xác nhận không khớp' });
            }
            // Lưu user
            const user = await newUser.save();
            // Trả về thông tin user
            res.status(200).json({ message: 'Đăng ký thành công', user });
        } catch (error) {
            res.status(500).json({ message: 'Lỗi register' });
        }
    },
    // Hàm đăng nhập người dùng
    loginUser: async (req, res) => {
        try {
            const user = await User.findOne({ email: req.body.email });
            if (!user) {
                return res.status(404).json({ message: 'Email không tồn tại' });
            }
            const isPasswordValid = await bcrypt.compare(req.body.mat_khau, user.mat_khau);
            if (!isPasswordValid) {
                return res.status(404).json({ message: 'Mật khẩu không đúng' });
            }
            if (user.trang_thai === false) {
                return res.status(404).json({ message: 'Tài khoản đã bị khóa' });
            }
            if (user && isPasswordValid && user.trang_thai === true) {
                // Tạo access token
                const access_token = authControllers.createAccessToken(user);
                // Tạo refresh token
                const refresh_token = authControllers.createRefreshToken(user);
                // Lưu refresh token vào HTTP-only cookie
                res.cookie('refresh_token', refresh_token, {
                    httpOnly: true,
                    secure: false, // Chỉ gửi cookie qua HTTPS trong môi trường sản xuất
                    sameSite: 'strict', // Bảo vệ chống CSRF
                    maxAge: 24 * 60 * 60 * 1000 // 1 ngày
                });
                const { mat_khau, xac_nhan_mat_khau, ...others } = user._doc; // Loại bỏ mật khẩu và xác nhận mật khẩu
                res.status(200).json({ message: 'Đăng nhập thành công', ...others, access_token });
            }
        } catch (error) {
            res.status(500).json({ message: 'Lỗi login' })
        }
    },
    // Hàm lấy refresh token
    refreshToken: async (req, res) => {
        const refresh_token = req.cookies.refresh_token;
        if (!refresh_token) {
            return res.status(401).json({ message: 'Không có refresh token' });
        }
        jwt.verify(refresh_token, process.env.JWT_REFRESH_TOKEN_SECRET, async (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Refresh token không hợp lệ' });
            }
            const currentUser = await User.findById(user.id);
            if (!currentUser) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }
            // Tạo access token mới
            const newAccessToken = authControllers.createAccessToken(currentUser);
            res.status(200).json({ access_token: newAccessToken });
        });
    }
};

module.exports = authControllers;