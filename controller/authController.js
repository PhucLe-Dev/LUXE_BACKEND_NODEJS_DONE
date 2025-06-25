const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
dotenv.config();
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const schemaNguoiDung = require('../model/schemaNguoiDung');
const conn = mongoose.createConnection(process.env.DATABASE_URL);
const User = conn.model('nguoi_dung', schemaNguoiDung);

const auth = admin.auth();
let refreshTokens = [];
const blacklistedAccessTokens = new Set();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Hàm tạo mật khẩu ngẫu nhiên
const generateRandomPassword = (length = 8) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    return password;
};

const authControllers = {
    // Hàm tạo access token
    createAccessToken: (user) => {
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
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

    // Hàm gửi email chứa mật khẩu mới
    sendNewPasswordEmail: async (user, newPassword) => {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Mật khẩu mới cho tài khoản của bạn',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #f4f4f4;
                            margin: 0;
                            padding: 0;
                        }
                        .container {
                            max-width: 600px;
                            margin: 20px auto;
                            background-color: #ffffff;
                            border-radius: 8px;
                            overflow: hidden;
                            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background-color: #ebbd5b;
                            color: #ffffff;
                            text-align: center;
                            padding: 20px;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 24px;
                        }
                        .content {
                            padding: 20px;
                            text-align: center;
                        }
                        .content h2 {
                            color: #333333;
                            font-size: 20px;
                        }
                        .content p {
                            color: #666666;
                            line-height: 1.6;
                            margin: 10px 0;
                        }
                        .password-box {
                            background-color: #f9f9f9;
                            border: 1px solid #e0e0e0;
                            padding: 15px;
                            margin: 15px 0;
                            border-radius: 5px;
                            font-size: 18px;
                            font-weight: bold;
                            color: #333333;
                        }
                        .button {
                            display: inline-block;
                            padding: 12px 24px;
                            background-color: #ebbd5b;
                            color: #ffffff;
                            text-decoration: none;
                            border-radius: 5px;
                            margin: 15px 0;
                            font-weight: bold;
                        }
                        .footer {
                            background-color: #ebbd5b;
                            text-align: center;
                            padding: 10px;
                            color: #ffffff;
                            font-size: 12px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>EMAIL ĐẶT LẠI MẬT KHẨU</h1>
                            <h2>LUXE</h2>
                        </div>
                        <div class="content">
                            <h2>Xin chào ${user.ho_ten},</h2>
                            <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
                            <p>Mật khẩu mới của bạn là:</p>
                            <div class="password-box">${newPassword}</div>
                            <p>Vui lòng sử dụng mật khẩu này để đăng nhập và đổi mật khẩu mới ngay sau khi đăng nhập.</p>
                            <a href="${process.env.CLIENT_URL}/login" class="button">Đăng nhập ngay</a>
                            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng liên hệ với chúng tôi ngay lập tức.</p>
                        </div>
                        <div class="footer">
                            <p>© 2025 LUXE. All rights reserved.</p>
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
            console.error('Lỗi gửi email mật khẩu:', error);
            return false;
        }
    },

    // Hàm xử lý quên mật khẩu
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(404).json({ message: 'Email không tồn tại' });
            }

            // Tạo mật khẩu ngẫu nhiên mới
            const newPassword = generateRandomPassword();
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Cập nhật mật khẩu mới cho người dùng
            user.mat_khau = hashedPassword;
            await user.save();

            // Gửi email chứa mật khẩu mới
            const emailSent = await authControllers.sendNewPasswordEmail(user, newPassword);
            if (!emailSent) {
                return res.status(500).json({ message: 'Lỗi gửi email chứa mật khẩu mới' });
            }

            res.status(200).json({ message: 'Mật khẩu mới đã được gửi đến email của bạn' });
        } catch (error) {
            console.error('Lỗi quên mật khẩu:', error);
            res.status(500).json({ message: 'Lỗi xử lý yêu cầu quên mật khẩu' });
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
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const accessToken = authHeader.split(' ')[1];
            blacklistedAccessTokens.add(accessToken);
        }
        res.status(200).json({ message: 'Đăng xuất thành công' });
    },

    // Hàm thay đổi mật khẩu
    changePasswordUser: async (req, res) => {
        try {
            const { mat_khau, mat_khau_moi, xac_nhan_mat_khau_moi } = req.body;
            const userId = req.user.id; // Lấy từ middleware verifyToken

            // Tìm người dùng
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }

            // Kiểm tra mật khẩu hiện tại
            const isPasswordValid = await bcrypt.compare(mat_khau, user.mat_khau);
            if (!isPasswordValid) {
                return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
            }

            // Kiểm tra mật khẩu mới và xác nhận mật khẩu mới có khớp không
            if (mat_khau_moi !== xac_nhan_mat_khau_moi) {
                return res.status(400).json({ message: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });
            }

            // Mã hóa mật khẩu mới
            const salt = await bcrypt.genSalt(10);
            const hashedNewPassword = await bcrypt.hash(mat_khau_moi, salt);

            // Cập nhật mật khẩu mới và thời gian cập nhật
            user.mat_khau = hashedNewPassword;
            user.xac_nhan_mat_khau = mat_khau_moi; // Cập nhật trường xac_nhan_mat_khau nếu cần
            user.updated_at = Date.now();
            await user.save();

            res.status(200).json({ message: 'Đổi mật khẩu thành công' });
        } catch (error) {
            console.error('Lỗi thay đổi mật khẩu:', error);
            res.status(500).json({ message: 'Lỗi xử lý yêu cầu đổi mật khẩu' });
        }
    },

    // Hàm đăng nhập bằng google
    googleLogin: async (req, res) => {
        try {
            const { idToken } = req.body;
            const decodedToken = await auth.verifyIdToken(idToken);
            const { uid, email, name, picture } = decodedToken; // Lấy picture (avatar) từ Firebase

            let nguoiDung = await User.findOne({ email });
            if (!nguoiDung) {
                nguoiDung = new User({
                    ho_ten: name || email.split('@')[0],
                    email,
                    googleId: uid,
                    loginType: 'google',
                    trang_thai: true,
                    avatar: picture || 'https://res.cloudinary.com/dohwmkapy/image/upload/v1749871081/default-avatar_rwg8qu.webp' // Lưu avatar từ Google hoặc mặc định
                });
                await nguoiDung.save();
                
            } else if (!nguoiDung.googleId) {
                nguoiDung.googleId = uid;
                nguoiDung.loginType = 'google';
                nguoiDung.avatar = picture || nguoiDung.avatar || 'https://res.cloudinary.com/dohwmkapy/image/upload/v1749871081/default-avatar_rwg8qu.webp';
                await nguoiDung.save();
                console.log('Tài khoản đã liên kết với Google:', email);
            } else {
                console.log('Người dùng đã tồn tại:', email);
            }
            const access_token = authControllers.createAccessToken(nguoiDung);
            const refresh_token = authControllers.createRefreshToken(nguoiDung);
            refreshTokens.push(refresh_token);
            res.cookie('refresh_token', refresh_token, { httpOnly: true, secure: false, sameSite: 'strict' });
            const { mat_khau, ...others } = nguoiDung._doc;
            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                user: { ...others, avatar: nguoiDung.avatar }, // Trả về avatar
                access_token
            });
        } catch (error) {
            console.error('Lỗi:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    },

    // Hàm đăng nhập bằng facebook
    facebookLogin: async (req, res) => {
        try {
            const { idToken } = req.body;
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const { uid, email, name, picture } = decodedToken;

            let ho_ten = name || email.split('@')[0];
            let nguoiDung = await User.findOne({ email });

            if (!nguoiDung) {
                nguoiDung = new User({
                    ho_ten,
                    email,
                    facebookId: uid,
                    loginType: 'facebook',
                    trang_thai: true,
                    avatar: picture || 'https://res.cloudinary.com/dohwmkapy/image/upload/v1749871081/default-avatar_rwg8qu.webp'
                });
                await nguoiDung.save();
                console.log('Người dùng mới được tạo:', email);
            } else if (!nguoiDung.facebookId) {
                nguoiDung.facebookId = uid;
                nguoiDung.loginType = 'facebook';
                nguoiDung.avatar = picture || nguoiDung.avatar;
                await nguoiDung.save();
                console.log('Tài khoản đã liên kết với Facebook:', email);
            } else {
                console.log('Người dùng đã tồn tại:', email);
            }
            const access_token = authControllers.createAccessToken(nguoiDung);
            const refresh_token = authControllers.createRefreshToken(nguoiDung);
            res.cookie('refresh_token', refresh_token, { httpOnly: true, secure: false, sameSite: 'strict' });
            const { mat_khau, ...others } = nguoiDung._doc;
            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                user: { ...others, avatar: nguoiDung.avatar, loginType: nguoiDung.loginType },
                access_token
            });
        } catch (error) {
            console.error('Lỗi:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    },

    getCurrentUser: async (req, res) => {
        try {
            const user = await User.findById(req.user.id).select("-mat_khau -xac_nhan_mat_khau");
            if (!user) {
                return res.status(404).json({ message: "Không tìm thấy người dùng" });
            }

            res.status(200).json({ user });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi server khi lấy thông tin người dùng" });
        }
    },

    updateUser: async (req, res) => {
        try {
            const updates = { ...req.body };

            if (updates.email) {
                delete updates.email;
            }

            updates.updated_at = new Date();

            const user = await User.findByIdAndUpdate(
                req.user.id,
                { $set: updates },
                { new: true, runValidators: true, context: 'query' }
            ).select("-mat_khau -xac_nhan_mat_khau");

            if (!user) {
                return res.status(404).json({ message: "Không tìm thấy người dùng" });
            }

            res.status(200).json({ message: "Cập nhật thành công", user });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi server khi cập nhật người dùng" });
        }
    },
};

module.exports = {
    ...authControllers,
    blacklistedAccessTokens,
}