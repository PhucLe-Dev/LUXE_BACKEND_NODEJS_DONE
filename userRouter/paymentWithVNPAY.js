const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// ✅ Cấu hình cố định từ bạn
const vnp_TmnCode = '5F6U2XP5';
const vnp_HashSecret = 'X52DQXDT260B45XEEBS51Z5IITZBOSZM'
const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
const vnp_ReturnUrl = 'https://luxe-customer-web-25-local.vercel.app/payment'

// ✅ Hàm tạo URL thanh toán VNPay
router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    if (!amount || !orderId || !orderInfo) {
        return res.status(400).json({ error: 'Thiếu thông tin thanh toán.' });
    }

    // Làm sạch orderInfo (bỏ dấu và ký tự đặc biệt)
    const cleanOrderInfo = orderInfo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');

    const ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId.toString(),
        vnp_OrderInfo: cleanOrderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_ReturnUrl,
        vnp_IpAddr: ipAddr === '::1' ? '127.0.0.1' : ipAddr,
        vnp_CreateDate: createDate,
        vnp_SecureHashType: 'sha256',
    };
    console.log("🚨 Check ReturnUrl:", JSON.stringify(vnp_Params.vnp_ReturnUrl));

    console.log("🧾 VNP Params:", vnp_Params);

    const sortedParams = Object.keys(vnp_Params)
        .sort()
        .reduce((acc, key) => {
            acc[key] = vnp_Params[key];
            return acc;
        }, {});

    console.log("🧾 Raw Params:", sortedParams);

    // 🔐 Bước 1: ký trên bản chưa encode
    const signData = qs.stringify(sortedParams, { encode: false }); // ❗ Rất quan trọng
    const secureHash = crypto
        .createHmac("sha256", vnp_HashSecret)
        .update(Buffer.from(signData, "utf-8"))
        .digest("hex");

    // Gắn hash vào params
    sortedParams.vnp_SecureHash = secureHash;

    // 🔗 Bước 2: tạo URL với bản đã encode
    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;


    console.log("🔐 signData:", signData);
    console.log("🔐 secureHash:", secureHash);
    console.log("🔗 paymentUrl:", paymentUrl);


    return res.json({ paymentUrl });
});

module.exports = router;
