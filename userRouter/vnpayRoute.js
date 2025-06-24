const express = require('express');
const router = express.Router();
const moment = require('moment'); // Để xử lý ngày giờ
const crypto = require('crypto'); // Để tạo mã hóa (hash)
const querystring = require('qs'); // Để xử lý chuỗi truy vấn URL
const mongoose = require("mongoose");

// Giả sử mô hình DonHang của bạn đã được thiết lập đúng và có thể truy cập được
const conn = mongoose.createConnection("mongodb://127.0.0.1:27017/fashion_web25");
const DonHang = conn.model('don_hang', require('../model/schemaDonHang'));

// Tải cấu hình VNPay từ biến môi trường (Environment Variables)
// Rất quan trọng: Đừng mã hóa cứng (hardcode) các khóa này trực tiếp trong code.
const vnp_TmnCode = process.env.VNP_TMNCODE;
const vnp_HashSecret = process.env.VNP_HASHSECRET;
const vnp_Url = process.env.VNP_URL;
const vnp_ReturnUrl = process.env.VNP_RETURNURL;
const vnp_IpNUrl = process.env.VNP_IPNURL; // Nên thiết lập một URL IPN

// Route để tạo URL thanh toán VNPay
router.post('/create_payment_url', async (req, res) => {
    try {
        const { orderId, amount, bankCode, language } = req.body; // Bạn sẽ gửi orderId và amount từ frontend
         console.log("Request from frontend:", { orderId, amount, bankCode, language });


        if (!orderId || !amount) {
            return res.status(400).json({ success: false, message: "Thiếu ID đơn hàng hoặc số tiền." });
        }

        const order = await DonHang.findById(orderId);
        console.log("Found order:", order);
        if (!order) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        const createDate = moment().format('YYYYMMDDHHmmss');
        // Tạo một ID duy nhất cho VNPay, có thể kết hợp ID đơn hàng của bạn
        // Ví dụ: Lấy 5 ký tự cuối của orderId để đảm bảo tính duy nhất và không quá dài
        const orderId_vnpay = moment().format('DDHHmmss') + orderId.slice(-5);

        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = vnp_TmnCode;
        vnp_Params['vnp_Locale'] = language || 'vn'; // Ngôn ngữ: 'vn' hoặc 'en'
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_TxnRef'] = orderId_vnpay; // Mã tham chiếu giao dịch duy nhất của bạn cho VNPay
        vnp_Params['vnp_OrderInfo'] = `Thanh toan cho don hang ${order.ma_don_hang}`;
        vnp_Params['vnp_OrderType'] = 'billpayment'; // Loại hình thanh toán
        vnp_Params['vnp_Amount'] = amount * 100; // VNPay yêu cầu số tiền tính bằng đơn vị nhỏ nhất (cent/đơn vị tiền tệ)
        vnp_Params['vnp_ReturnUrl'] = vnp_ReturnUrl; // URL để VNPay chuyển hướng người dùng về sau thanh toán
        vnp_Params['vnp_IpNUrl'] = vnp_IpNUrl; // URL để VNPay gửi thông báo trạng thái thanh toán (server-to-server)
        vnp_Params['vnp_CreateDate'] = createDate;
        vnp_Params['vnp_ExpireDate'] = moment().add(15, 'minutes').format('YYYYMMDDHHmmss'); // Thời gian hết hạn của URL (15 phút)

        if (bankCode) { // Mã ngân hàng (nếu có)
            vnp_Params['vnp_BankCode'] = bankCode;
        }
        
        // Sắp xếp các tham số theo thứ tự alphabet
        vnp_Params = sortObject(vnp_Params);
        console.log("VNPay Params before signing:", vnp_Params);

        // Tạo chuỗi dữ liệu để ký
        const signData = querystring.stringify(vnp_Params, { encode: false });
        console.log("Sign Data:", signData);
        // Tạo mã hash SHA512
        const hmac = crypto.createHmac("sha512", vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        console.log("Generated SecureHash:", signed);
        vnp_Params['vnp_SecureHash'] = signed; // Thêm mã hash vào tham số

        // Xây dựng URL thanh toán cuối cùng
        const vnpUrl = vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
        console.log("VNPay URL to redirect:", vnpUrl);

        res.status(200).json({ success: true, vnpUrl });

    } catch (error) {
        console.error("Lỗi khi tạo URL thanh toán VNPay:", error);
        res.status(500).json({ success: false, message: "Không thể tạo URL thanh toán VNPay." });
    }
});

// Route xử lý VNPay Return URL (khi người dùng được chuyển hướng về)
router.get('/vnpay_return', async (req, res) => {
    let vnp_Params = req.query; // Lấy các tham số từ URL
    let secureHash = vnp_Params['vnp_SecureHash']; // Mã hash bảo mật

    // Xóa các tham số hash để xác minh lại
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params); // Sắp xếp lại tham số

    // Tạo lại mã hash để so sánh
    const signData = querystring.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

    if (secureHash === signed) { // Xác minh chữ ký hợp lệ
        const orderId_vnpay = vnp_Params['vnp_TxnRef']; // Mã tham chiếu giao dịch VNPay
        const rspCode = vnp_Params['vnp_ResponseCode']; // Mã phản hồi từ VNPay
        const transactionStatus = vnp_Params['vnp_TransactionStatus']; // Trạng thái giao dịch
        const amount = vnp_Params['vnp_Amount'] / 100; // Số tiền (chuyển đổi lại về đơn vị ban đầu)
        const orderInfo = vnp_Params['vnp_OrderInfo']; // Thông tin đơn hàng

        // Trích xuất ID đơn hàng nội bộ của bạn từ orderId_vnpay
        // (Phụ thuộc vào cách bạn đã xây dựng vnp_TxnRef)
        const actualOrderId = orderId_vnpay.substring(6); // Ví dụ: Nếu vnp_TxnRef là 'DHXXXXX[YOUR_ID]'

        // Tìm đơn hàng trong cơ sở dữ liệu của bạn
        const order = await DonHang.findById(actualOrderId);
        if (!order) {
            // Xử lý trường hợp không tìm thấy đơn hàng, có thể chuyển hướng đến trang lỗi
            return res.redirect(`${process.env.FE_BASE_URL}/payment-status?success=false&message=Order not found`);
        }

        // Kiểm tra mã phản hồi và trạng thái giao dịch
        if (rspCode === '00' && transactionStatus === '00') {
            // Thanh toán thành công
            if (order.trang_thai_thanh_toan !== "Đã thanh toán") {
                order.trang_thai_thanh_toan = "Đã thanh toán";
                order.phuong_thuc_thanh_toan = "VNPay";
                await order.save();
                // Chuyển hướng đến trang thành công trên frontend của bạn
                return res.redirect(`${process.env.FE_BASE_URL}/payment-status?success=true&orderId=${order.ma_don_hang}`);
            } else {
                // Đơn hàng đã được cập nhật bởi IPN, chỉ cần chuyển hướng
                return res.redirect(`${process.env.FE_BASE_URL}/payment-status?success=true&orderId=${order.ma_don_hang}&message=Order already processed`);
            }
        } else {
            // Thanh toán thất bại hoặc đang chờ xử lý
            // Bạn có thể muốn cập nhật trạng thái đơn hàng thành "Thanh toán thất bại"
            // Nếu ban đầu là "Chờ xác nhận", hãy giữ nguyên hoặc đánh dấu là thất bại
            // An toàn hơn là dựa vào IPN để có trạng thái cuối cùng
            return res.redirect(`${process.env.FE_BASE_URL}/payment-status?success=false&message=Payment failed or cancelled`);
        }
    } else {
        // Chữ ký không hợp lệ
        return res.redirect(`${process.env.FE_BASE_URL}/payment-status?success=false&message=Invalid signature`);
    }
});

// Route xử lý VNPay IPN URL (cho giao tiếp server-to-server)
// Đây là phần quan trọng để cập nhật trạng thái thanh toán một cách đáng tin cậy
router.get('/vnpay_ipn', async (req, res) => {
    let vnp_Params = req.query;
    let secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params);

    const signData = querystring.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

    let paymentStatus = '0'; // 0: Thành công, 1: Thất bại, 2: Không tìm thấy đơn hàng, 99: Lỗi khác

    try {
        if (secureHash === signed) {
            const orderId_vnpay = vnp_Params['vnp_TxnRef'];
            const rspCode = vnp_Params['vnp_ResponseCode'];
            const transactionStatus = vnp_Params['vnp_TransactionStatus'];
            const amount = vnp_Params['vnp_Amount'] / 100;
            const orderInfo = vnp_Params['vnp_OrderInfo'];

            const actualOrderId = orderId_vnpay.substring(6);

            const order = await DonHang.findById(actualOrderId);

            if (order) {
                if (order.tong_tien === amount) { // Kiểm tra xem số tiền có khớp không
                    if (rspCode === '00' && transactionStatus === '00') {
                        // Thanh toán thành công
                        if (order.trang_thai_thanh_toan !== "Đã thanh toán") {
                            order.trang_thai_thanh_toan = "Đã thanh toán";
                            order.phuong_thuc_thanh_thanh = "VNPay";
                            await order.save();
                            paymentStatus = '0'; // Thành công
                        } else {
                            paymentStatus = '0'; // Đã được cập nhật, vẫn là thành công
                        }
                    } else {
                        // Thanh toán thất bại hoặc đang chờ xử lý
                        if (order.trang_thai_thanh_toan === "Chờ xác nhận") { // Chỉ cập nhật nếu chưa được xử lý
                            order.trang_thai_thanh_toan = "Thanh toán thất bại";
                            await order.save();
                        }
                        paymentStatus = '1'; // Thất bại
                    }
                } else {
                    paymentStatus = '1'; // Không khớp số tiền
                }
            } else {
                paymentStatus = '2'; // Không tìm thấy đơn hàng
            }
        } else {
            paymentStatus = '97'; // Chữ ký không hợp lệ
        }
    } catch (err) {
        paymentStatus = '99'; // Lỗi khác
        console.error("Lỗi IPN VNPay:", err);
    }

    // Phản hồi lại cho VNPay IPN
    res.status(200).json({ RspCode: paymentStatus, Message: "Success" });
});


// Hàm sắp xếp đối tượng theo thứ tự alphabet của khóa
function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}

module.exports = router;