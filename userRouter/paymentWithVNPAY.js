const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// === THÔNG TIN TỪ VNPay SANDBOX ===
const vnp_TmnCode = process.env.VNP_TMNCODE?.trim();
const vnp_HashSecret = process.env.VNP_HASHSECRET?.trim();
const vnp_Url = process.env.VNP_URL?.trim();
const vnp_ReturnUrlOrigin = process.env.VNP_RETURNURL?.trim();
const vnp_ReturnUrl = vnp_ReturnUrlOrigin.replace(/;$/, '');

// Debug environment
console.log('Environment check:');
console.log('VNP_TMNCODE:', vnp_TmnCode);
console.log('VNP_HASHSECRET length:', vnp_HashSecret?.length);
console.log('VNP_URL:', vnp_Url);
console.log('VNP_RETURNURL:', vnp_ReturnUrl);

// === API: TẠO URL THANH TOÁN ===
router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipAddr = ip === '::1' ? '127.0.0.1' : ip;
    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: vnp_TmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId.toString().replace(/[^a-zA-Z0-9]/g, ''),
        vnp_OrderInfo: `Payment for order ${orderId}`,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_ReturnUrl: vnp_ReturnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
    };

    console.log('🔍 vnp_ReturnUrl:', JSON.stringify(vnp_ReturnUrl));
    console.log('🔍 Original params:', JSON.stringify(vnp_Params, null, 2));


    // Sắp xếp params theo thứ tự alphabet
    const sortedParams = {};
    Object.keys(vnp_Params).sort().forEach((key) => {
        sortedParams[key] = vnp_Params[key];
    });

    console.log('📋 Sorted params:', sortedParams);

    // Tạo signData
    const signData = Object.keys(sortedParams)
        .map(key => `${key}=${sortedParams[key]}`)
        .join('&');

    console.log('🔐 SignData:', signData);

    // Thêm vào trước khi tạo hash
    console.log('🔍 SignData bytes:', Buffer.from(signData, 'utf-8'));
    console.log('🔍 HashSecret bytes:', Buffer.from(vnp_HashSecret, 'utf-8'));

    // Tạo hash
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    console.log('🔑 SecureHash:', signed);

    // Thêm hash vào params
    sortedParams.vnp_SecureHash = signed;


    // Tạo URL
    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;

    console.log('✅ Payment URL:', paymentUrl);

    res.json({ paymentUrl });
});

module.exports = router;