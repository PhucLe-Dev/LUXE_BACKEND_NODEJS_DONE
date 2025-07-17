const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const User = mongoose.model('nguoi_dung', require('../model/schemaNguoiDung'));
dotenv.config();

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
        return jwt.sign({ id: user._id, vai_tro: user.vai_tro }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
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
        const verificationLink = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Xác thực tài khoản của bạn - LUXE STORE',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <div style="background-color: #ebbd5b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">LUXE STORE</h1>
                    <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">XÁC THỰC TÀI KHOẢN</p>
                </div>
                
                <div style="padding: 20px; background-color: #f9f9f9;">
                    <h2 style="color: #333; margin-bottom: 20px;">Xin chào ${user.ho_ten},</h2>
                    
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                        Chào mừng bạn đến với Luxe Store! Để hoàn tất quá trình đăng ký, 
                        vui lòng xác thực tài khoản của bạn bằng cách nhấp vào nút bên dưới.
                    </p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" 
                           style="display: inline-block; padding: 15px 30px; background-color: #ebbd5b; 
                                  color: white; text-decoration: none; border-radius: 5px; 
                                  font-weight: bold; font-size: 16px;">
                            XÁC THỰC TÀI KHOẢN
                        </a>
                    </div>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ebbd5b;">
                        <p style="margin: 0; color: #666; font-size: 14px;">
                            <strong>⚠️ Lưu ý:</strong> Liên kết này sẽ hết hạn sau 24 giờ. 
                            Nếu bạn không yêu cầu xác thực, vui lòng bỏ qua email này.
                        </p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                        Nếu nút không hoạt động, bạn có thể sao chép và dán liên kết sau vào trình duyệt:
                    </p>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; word-break: break-all;">
                        <p style="margin: 0; color: #888; font-size: 14px;">${verificationLink}</p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Nếu có thắc mắc, bạn có thể liên hệ với chúng tôi qua:
                    </p>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0; color: #666; font-size: 14px;"><strong>📍 Địa chỉ:</strong> 11 Đ. Sư Vạn Hạnh, Phường 12, Quận 10, Hồ Chí Minh</p>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;"><strong>📞 Điện thoại:</strong> +84 (310) 555-1234</p>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;"><strong>📧 Email:</strong> luxesupport@gmail.com</p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Trân trọng,<br>
                        <strong>Đội ngũ hỗ trợ khách hàng Luxe Store</strong>
                    </p>
                </div>
                
                <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; font-size: 14px;">© 2025 Luxe Store - Cảm ơn bạn đã tin tưởng chúng tôi!</p>
                </div>
            </div>
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
            subject: 'Mật khẩu mới cho tài khoản của bạn - LUXE STORE',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <div style="background-color: #ebbd5b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">LUXE STORE</h1>
                    <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">ĐẶT LẠI MẬT KHẨU</p>
                </div>
                
                <div style="padding: 20px; background-color: #f9f9f9;">
                    <h2 style="color: #333; margin-bottom: 20px;">Xin chào ${user.ho_ten},</h2>
                    
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                        Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. 
                        Mật khẩu mới đã được tạo và hiển thị bên dưới:
                    </p>
                    
                    <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ebbd5b; text-align: center;">
                        <p style="margin: 0; color: #666; font-size: 14px; margin-bottom: 10px;"><strong>MẬT KHẨU MỚI CỦA BẠN:</strong></p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 2px dashed #ebbd5b;">
                            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #333; font-family: 'Courier New', monospace;">${newPassword}</p>
                        </div>
                    </div>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ff6b6b;">
                        <p style="margin: 0; color: #666; font-size: 14px;">
                            <strong>⚠️ Quan trọng:</strong> Vui lòng đổi mật khẩu ngay sau khi đăng nhập để bảo mật tài khoản của bạn.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.NEXT_PUBLIC_API_BASE_URL}/login" 
                           style="display: inline-block; padding: 15px 30px; background-color: #ebbd5b; 
                                  color: white; text-decoration: none; border-radius: 5px; 
                                  font-weight: bold; font-size: 16px;">
                            ĐĂNG NHẬP NGAY
                        </a>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                        Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng liên hệ với chúng tôi ngay lập tức 
                        để bảo vệ tài khoản của bạn.
                    </p>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0; color: #666; font-size: 14px;"><strong>📍 Địa chỉ:</strong> 11 Đ. Sư Vạn Hạnh, Phường 12, Quận 10, Hồ Chí Minh</p>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;"><strong>📞 Điện thoại:</strong> +84 (310) 555-1234</p>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;"><strong>📧 Email:</strong> luxesupport@gmail.com</p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Trân trọng,<br>
                        <strong>Đội ngũ hỗ trợ khách hàng Luxe Store</strong>
                    </p>
                </div>
                
                <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; font-size: 14px;">© 2025 Luxe Store - Bảo mật tài khoản là ưu tiên hàng đầu!</p>
                </div>
            </div>
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


            const users = await User.find(); // lấy toàn bộ user
            const user = await Promise.all(users.map(async u => ({
                ...u._doc,
                isMatch: await bcrypt.compare(mat_khau, u.mat_khau)
            }))).then(results => results.find(u => u.isMatch));

            if (!user) {
                return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
            }

            if (mat_khau_moi !== xac_nhan_mat_khau_moi) {
                return res.status(400).json({ message: 'Mật khẩu mới và xác nhận không khớp' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedNewPassword = await bcrypt.hash(mat_khau_moi, salt);

            await User.findByIdAndUpdate(user._id, {
                mat_khau: hashedNewPassword,
                xac_nhan_mat_khau: mat_khau_moi, // nếu bạn vẫn cần
                updated_at: Date.now(),
            });

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