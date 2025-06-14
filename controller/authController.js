const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
dotenv.config();
const bcrypt = require('bcrypt');
const schemaNguoiDung = require('../model/schemaNguoiDung');
const conn = mongoose.createConnection(process.env.DATABASE_URL);
const User = conn.model('nguoi_dung', schemaNguoiDung);

let refreshTokens = [];

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const authControllers = {
    // Hàm tạo access token
    createAccessToken: (user) => {
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '30s' });
    },
    // Hàm tạo refresh token
    createRefreshToken: (user) => {
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: '1d' });
    },
    // Hàm tạo verification token
    createVerificationToken: (user) => {
        return jwt.sign({ id: user._id }, process.env.JWT_VERIFICATION_TOKEN_SECRET, { expiresIn: '1d' });
    },
    // Hàm gửi email xác thực
    sendVerificationEmail: async (user, verificationToken) => {
        const verificationLink = `${process.env.CLIENT_URL}/api/auth/verify-email?token=${verificationToken}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Xác thực tài khoản của bạn',
            html: `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            .header {
              background-color: #ebbd5b;
              color: #ffffff;
              text-align: center;
              padding: 20px 0;
            }
            .header h1 {
              font-size: 24px;
              font-weight: bold;
              margin: 0;
            }
            .logo {
              font-size: 40px;
              font-weight: bold;
              color: #ffffff;
              margin-top: 10px;
            }
            .content {
              padding: 30px;
              text-align: center;
            }
            .content h2 {
              font-size: 20px;
              color: #333333;
              margin-bottom: 15px;
            }
            .content p {
              font-size: 16px;
              color: #666666;
              line-height: 1.5;
              margin-bottom: 20px;
            }
            .verification-link {
              display: inline-block;
              padding: 12px 25px;
              background-color: #ebbd5b;
              color: #ffffff;
              text-decoration: none;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
            }
            .verification-link:hover {
              background-color: #d4a047;
            }
            .footer {
              text-align: center;
              padding: 20px;
              font-size: 12px;
              color: #999999;
              background-color: #f4f4f4;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>EMAIL XÁC THỰC TÀI KHOẢN KHÁCH HÀNG</h1>
              <div class="logo">LUXE</div>
            </div>
            <div class="content">
              <h2>Xin chào ${user.ho_ten},</h2>
              <p>Vui lòng nhấp vào nút bên dưới để xác thực tài khoản của bạn:</p>
              <a href="${verificationLink}" class="verification-link">Xác thực ngay</a>
              <p>Liên kết này sẽ hết hạn sau 24 giờ. Nếu bạn không yêu cầu xác thực, hãy bỏ qua email này.</p>
            </div>
            <div class="footer">
              <p>&copy; 2025 LUXE. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
        };

        try {
            await transporter.sendMail(mailOptions);
            return true;
        } catch (error) {
            console.error('Lỗi gửi email:', error);
            return false;
        }
    },
    // Hàm đăng ký người dùng
    registerUser: async (req, res) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(req.body.mat_khau, salt);

            // Kiểm tra email đã tồn tại
            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) {
                return res.status(400).json({ message: 'Email đã được sử dụng' });
            }

            // Tạo user với trạng thái chưa xác thực
            const newUser = new User({
                ho_ten: req.body.ho_ten,
                email: req.body.email,
                mat_khau: hashedPassword,
                xac_nhan_mat_khau: req.body.mat_khau,
            });

            // Lưu user
            const user = await newUser.save();

            // Tạo và gửi verification token
            const verificationToken = authControllers.createVerificationToken(user);
            const emailSent = await authControllers.sendVerificationEmail(user, verificationToken);

            if (!emailSent) {
                // Xóa user nếu gửi email thất bại
                await User.findByIdAndDelete(user._id);
                return res.status(500).json({ message: 'Lỗi gửi email xác thực' });
            }

            res.status(200).json({
                message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản',
                user: {
                    _id: user._id,
                    ho_ten: user.ho_ten,
                    email: user.email,
                    trang_thai: user.trang_thai
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Lỗi đăng ký' });
        }
    },
    // Hàm xác thực email
    verifyEmail: async (req, res) => {
        try {
            const token = req.query.token;
            if (!token) {
                return res.status(400).json({ message: 'Token xác thực không được cung cấp' });
            }

            const decoded = jwt.verify(token, process.env.JWT_VERIFICATION_TOKEN_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }

            if (user.trang_thai) {
                return res.status(400).json({ message: 'Tài khoản đã được xác thực' });
            }

            // Cập nhật trạng thái tài khoản
            user.trang_thai = true;
            await user.save();

            res.status(200).json({ message: 'Xác thực email thành công. Bạn có thể đăng nhập.' });
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: 'Token xác thực không hợp lệ hoặc đã hết hạn' });
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
                return res.status(400).json({ message: 'Mật khẩu không đúng' });
            }
            if (user.trang_thai === false) {
                return res.status(403).json({ message: 'Tài khoản chưa được xác thực. Vui lòng kiểm tra email.' });
            }
            if (user && isPasswordValid && user.trang_thai === true) {
                // Tạo access token
                const access_token = authControllers.createAccessToken(user);
                // Tạo refresh token
                const refresh_token = authControllers.createRefreshToken(user);
                // Lưu refresh token vào mảng
                refreshTokens.push(refresh_token);
                // Lưu refresh token vào HTTP-only cookie
                res.cookie('refresh_token', refresh_token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production', // Chỉ gửi qua HTTPS trong production
                    sameSite: 'strict',
                });
                const { mat_khau, xac_nhan_mat_khau, ...others } = user._doc;
                res.status(200).json({ message: 'Đăng nhập thành công', ...others, access_token });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Lỗi đăng nhập' });
        }
    },
    // Hàm lấy refresh token
    refreshToken: async (req, res) => {
        const refresh_token = req.cookies.refresh_token;
        if (!refresh_token) {
            return res.status(401).json({ message: 'Không có refresh token' });
        }
        if (!refreshTokens.includes(refresh_token)) {
            return res.status(403).json({ message: 'Refresh token không hợp lệ' });
        }
        jwt.verify(refresh_token, process.env.JWT_REFRESH_TOKEN_SECRET, async (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Refresh token không hợp lệ' });
            }
            const currentUser = await User.findById(user.id);
            if (!currentUser) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }
            if (!currentUser.trang_thai) {
                return res.status(403).json({ message: 'Tài khoản chưa được xác thực' });
            }
            refreshTokens = refreshTokens.filter(token => token !== refresh_token);
            const newAccessToken = authControllers.createAccessToken(currentUser);
            const newRefreshToken = authControllers.createRefreshToken(currentUser);
            refreshTokens.push(newRefreshToken);
            res.cookie('refresh_token', newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });
            res.status(200).json({ access_token: newAccessToken });
        });
    },
    // Hàm đăng xuất người dùng
    logoutUser: async (req, res) => {
        res.clearCookie('refresh_token');
        refreshTokens = refreshTokens.filter(token => token !== req.cookies.refresh_token);
        res.status(200).json({ message: 'Đăng xuất thành công' });
    }
};

module.exports = authControllers;