const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// === Load thông tin từ biến môi trường ===
const vnp_TmnCode = process.env.VNP_TMNCODE?.trim();
const vnp_HashSecret = process.env.VNP_HASHSECRET?.trim();
const vnp_Url = process.env.VNP_URL?.trim();
const rawReturnUrl = process.env.VNP_RETURNURL || '';
const vnp_ReturnUrl = rawReturnUrl.trim().replace(/;+\s*$/, '');

// === Kiểm tra biến môi trường ===
console.log('🔧 Environment check:');
console.log('VNP_TMNCODE:', vnp_TmnCode);
console.log('VNP_HASHSECRET length:', vnp_HashSecret?.length);
console.log('VNP_URL:', vnp_Url);
console.log('VNP_RETURNURL (clean):', vnp_ReturnUrl);

// === API tạo link thanh toán VNPay ===
router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    if (!amount || !orderId || !orderInfo) {
        return res.status(400).json({ error: 'Thiếu thông tin thanh toán.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipAddr = ip === '::1' ? '127.0.0.1' : ip;
    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId.toString().replace(/[^a-zA-Z0-9]/g, ''),
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_ReturnUrl: vnp_ReturnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
    };

    console.log('🧾 Params (original):', JSON.stringify(vnp_Params, null, 2));

    // === Sắp xếp thứ tự alphabet
    const sortedParams = {};
    Object.keys(vnp_Params)
        .sort()
        .forEach((key) => {
            sortedParams[key] = vnp_Params[key];
        });

    // === Tạo chuỗi signData
    const signData = Object.entries(sortedParams)
        .map(([key, val]) => `${key}=${val}`)
        .join('&');

    console.log('🔐 SignData:', signData);

    // === Tạo hash SHA512
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    console.log('🔑 SecureHash:', secureHash);

    // === Gắn hash vào params
    sortedParams.vnp_SecureHash = secureHash;

    // === Tạo URL thanh toán
    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;
    console.log('✅ Payment URL:', paymentUrl);

    return res.json({ paymentUrl });
});

module.exports = router;
