const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// Cấu hình nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify email configuration
transporter.verify((error, success) => {
    if (error) {
        console.log('❌ Email configuration error:', error);
    } else {
        console.log('✅ Email server ready to send messages');
    }
});

// POST /api/contact - Gửi email liên hệ
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Validate input
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ thông tin'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ'
            });
        }

        // Email template cho cửa hàng
        const storeEmailTemplate = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <div style="background-color: #ebbd5b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">LUXE STORE - LIÊN HỆ MỚI</h1>
                </div>
                
                <div style="padding: 20px; background-color: #f9f9f9;">
                    <h2 style="color: #333; margin-bottom: 20px;">Thông tin liên hệ:</h2>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="margin: 0; color: #666;"><strong>Họ tên:</strong> ${name}</p>
                    </div>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="margin: 0; color: #666;"><strong>Email:</strong> ${email}</p>
                    </div>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="margin: 0; color: #666;"><strong>Vấn đề:</strong> ${subject}</p>
                    </div>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="margin: 0; color: #666;"><strong>Nội dung:</strong></p>
                        <div style="margin-top: 10px; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #ebbd5b;">
                            ${message.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                </div>
                
                <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; font-size: 14px;">© 2024 Luxe Store - Hệ thống quản lý liên hệ khách hàng</p>
                </div>
            </div>
        `;

        // Email template cho khách hàng (auto-reply)
        const customerEmailTemplate = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <div style="background-color: #ebbd5b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">LUXE STORE</h1>
                </div>
                
                <div style="padding: 20px; background-color: #f9f9f9;">
                    <h2 style="color: #333;">Xin chào ${name},</h2>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Cảm ơn bạn đã liên hệ với Luxe Store. Chúng tôi đã nhận được tin nhắn của bạn về 
                        "<strong>${subject}</strong>" và sẽ phản hồi trong thời gian sớm nhất.
                    </p>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ebbd5b;">
                        <p style="margin: 0; color: #666;"><strong>Tóm tắt tin nhắn của bạn:</strong></p>
                        <p style="margin: 10px 0 0 0; color: #888; font-style: italic;">${message}</p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Nếu có thắc mắc gấp, bạn có thể liên hệ trực tiếp qua:
                    </p>
                    
                    <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0; color: #666;"><strong>📍 Địa chỉ:</strong> 11 Đ. Sư Vạn Hạnh, Phường 12, Quận 10, Hồ Chí Minh</p>
                        <p style="margin: 10px 0 0 0; color: #666;"><strong>📞 Điện thoại:</strong> +84 (310) 555-1234</p>
                        <p style="margin: 10px 0 0 0; color: #666;"><strong>📧 Email:</strong> luxesupport@gmail.com</p>
                    </div>
                    
                    <p style="color: #666; line-height: 1.6;">
                        Trân trọng,<br>
                        <strong>Đội ngũ hỗ trợ khách hàng Luxe Store</strong>
                    </p>
                </div>
                
                <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0; font-size: 14px;">© 2024 Luxe Store - Cảm ơn bạn đã tin tưởng chúng tôi!</p>
                </div>
            </div>
        `;

        // Gửi email cho cửa hàng
        const storeMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Email cửa hàng
            subject: `[LUXE STORE] Liên hệ mới từ ${name} - ${subject}`,
            html: storeEmailTemplate
        };

        // Gửi email auto-reply cho khách hàng
        const customerMailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `[LUXE STORE] Cảm ơn bạn đã liên hệ - ${subject}`,
            html: customerEmailTemplate
        };

        // Gửi cả 2 email
        await Promise.all([
            transporter.sendMail(storeMailOptions),
            transporter.sendMail(customerMailOptions)
        ]);

        // Emit socket event nếu có
        if (req.io) {
            req.io.emit('new_contact', {
                name,
                email,
                subject,
                message,
                timestamp: new Date()
            });
        }

        res.status(200).json({
            success: true,
            message: 'Email đã được gửi thành công! Chúng tôi sẽ phản hồi sớm nhất có thể.'
        });

    } catch (error) {
        console.error('❌ Email sending error:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi gửi email. Vui lòng thử lại sau.'
        });
    }
});

// GET /api/contact/test - Test email configuration
router.get('/test', async (req, res) => {
    try {
        const testMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: '[TEST] Email Configuration Test',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #ebbd5b;">Email Configuration Test</h2>
                    <p>Nếu bạn nhận được email này, cấu hình email đã hoạt động chính xác!</p>
                    <p><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</p>
                </div>
            `
        };

        await transporter.sendMail(testMailOptions);

        res.status(200).json({
            success: true,
            message: 'Email test đã được gửi thành công!'
        });

    } catch (error) {
        console.error('❌ Email test error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi test email configuration',
            error: error.message
        });
    }
});

module.exports = router;