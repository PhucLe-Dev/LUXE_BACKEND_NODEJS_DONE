const nodemailer = require('nodemailer');

// Cấu hình transporter để gửi email.
// THAY THẾ các giá trị này bằng thông tin tài khoản email của bạn.
// Để bảo mật, bạn nên lưu các thông tin này trong file .env
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Ví dụ dùng Gmail
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER || 'cuahangluxe@gmail.com', // Email của bạn
        pass: process.env.EMAIL_PASS || 'luxe123@' // Mật khẩu ứng dụng cho email
    }
});

/**
 * Tạo nội dung email xác nhận đơn hàng
 * @param {object} order - Thông tin đơn hàng
 * @returns {string} - Nội dung email dạng HTML
 */
const createConfirmationEmailBody = (order) => {
    // Định dạng lại các giá trị tiền tệ cho đẹp mắt
    const formattedTotal = order.tong_tien.toLocaleString('vi-VN');
    const itemsList = order.chi_tiet.map(item =>
        `<li>${item.so_luong} x Sản phẩm (SKU: ${item.id_variant?.sku || 'N/A'}) - Giá: ${item.gia_ban.toLocaleString('vi-VN')}đ</li>`
    ).join('');

    return `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h1 style="color: #0056b3;">Xác nhận đơn hàng #${order.ma_don_hang}</h1>
            <p>Chào ${order.ho_ten},</p>
            <p>Cảm ơn bạn đã mua sắm tại cửa hàng của chúng tôi. Đơn hàng của bạn đã được xác nhận và sẽ sớm được chuẩn bị để giao đi.</p>
            <h3>Chi tiết đơn hàng:</h3>
            <ul>
                ${itemsList}
            </ul>
            <p><strong>Tổng cộng: ${formattedTotal}đ</strong></p>
       
            <p>Cảm ơn bạn!</p>
        </div>
    `;
};

/**
 * Tạo nội dung email hủy đơn hàng
 * @param {object} order - Thông tin đơn hàng
 * @returns {string} - Nội dung email dạng HTML
 */
const createCancellationEmailBody = (order) => {
    return `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h1 style="color: #d9534f;">Thông báo hủy đơn hàng #${order.ma_don_hang}</h1>
            <p>Chào ${order.ho_ten},</p>
            <p>Chúng tôi rất tiếc phải thông báo rằng đơn hàng #${order.ma_don_hang} của bạn đã được hủy theo yêu cầu.</p>
            <p>Nếu có bất kỳ sai sót nào, vui lòng liên hệ với chúng tôi ngay lập tức.</p>
            <p>Chúng tôi hiểu rằng đôi khi kế hoạch thay đổi. Cửa hàng luôn có rất nhiều sản phẩm mới và các chương trình khuyến mãi hấp dẫn đang chờ bạn.</p>
            <p>Hãy quay lại và khám phá nhé!</p>
            <a href="http://localhost:3003" style="display: inline-block; padding: 10px 20px; background-color: #0056b3; color: #fff; text-decoration: none; border-radius: 5px;">Quay lại cửa hàng</a>
            <p>Cảm ơn bạn đã quan tâm!</p>
        </div>
    `;
};

/**
 * Gửi email thông báo trạng thái đơn hàng
 * @param {object} order - Đối tượng đơn hàng đầy đủ thông tin
 * @param {string} status - Trạng thái mới của đơn hàng ('Đã xác nhận' hoặc 'Hủy đơn hàng')
 */
const sendOrderStatusEmail = async (order, status) => {
    if (!order.email) {
        console.log('Không có email khách hàng để gửi.');
        return;
    }

    let subject = '';
    let htmlContent = '';

    if (status === 'Đã xác nhận') {
        subject = `Xác nhận đơn hàng của bạn #${order.ma_don_hang}`;
        htmlContent = createConfirmationEmailBody(order);
    } else if (status === 'Hủy đơn hàng') {
        subject = `Đơn hàng #${order.ma_don_hang} đã được hủy`;
        htmlContent = createCancellationEmailBody(order);
    } else {
        return; // Không gửi email cho các trạng thái khác
    }

    const mailOptions = {
        from: `"Chăm Sóc Khách Hàng LUXE" <${process.env.EMAIL_USER || 'cuahangluxe@gmail.com'}>`,
        to: order.email,
        subject: subject,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email đã được gửi tới ${order.email} cho trạng thái: ${status}`);
    } catch (error) {
        console.error('Lỗi khi gửi email:', error);
        // Ném lỗi để route có thể bắt và xử lý nếu cần
        throw new Error('Gửi email thất bại.');
    }
};

module.exports = { sendOrderStatusEmail };
