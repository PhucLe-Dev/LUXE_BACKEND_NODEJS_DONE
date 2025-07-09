const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// === THÔNG TIN TỪ VNPay SANDBOX ===
const vnp_TmnCode = 'REGMMAYQ';
const vnp_HashSecret = 'JL74UD9LLAUO61D8DHYRC3W64GVJV06G';
const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = 'http://localhost:3003/payment'; // ⚠️ URL frontend hiển thị kết quả

// === API: TẠO URL THANH TOÁN ===
router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    // === LẤY IP CLIENT ===
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipAddr = ip === '::1' ? '127.0.0.1' : ip;

    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId.replace(/[^a-zA-Z0-9]/g, ''), // loại bỏ ký tự lạ
        vnp_OrderInfo: orderInfo.trim(),
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_ReturnUrl: vnp_ReturnUrl.trim(),
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
    };

    // === SẮP XẾP THAM SỐ THEO THỨ TỰ CHỮ CÁI ===
    const sortedParams = {};
    Object.keys(vnp_Params).sort().forEach((key) => {
        sortedParams[key] = vnp_Params[key];
    });

    // === TẠO CHUỖI KÝ ===
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', vnp_HashSecret.trim());
    const signed = hmac.update(signData).digest('hex');

    // === GẮN CHỮ KÝ VÀO PARAMS ===
    sortedParams.vnp_SecureHash = signed;
    sortedParams.vnp_SecureHashType = 'SHA512';

    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;

    // === LOG GIÚP DEBUG ===
    console.log("✅ Payment URL:", paymentUrl);
    console.log("🔐 SignData:", signData);
    console.log("🔑 SecureHash:", signed);

    res.json({ paymentUrl });
});

module.exports = router;
