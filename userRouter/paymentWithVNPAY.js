const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// === THÔNG TIN TỪ VNPay SANDBOX ===
const vnp_TmnCode = `${process.env.VNP_TMNCODE}`;
const vnp_HashSecret = `${process.env.VNP_HASHSECRET}`;
const vnp_Url = `${process.env.VNP_URL}`;
const vnp_ReturnUrl = `${process.env.VNP_RETURNURL}`;

// Thêm vào đầu file để debug
console.log('Environment check:');
console.log('VNP_TMNCODE:', process.env.VNP_TMNCODE);
console.log('VNP_HASHSECRET length:', process.env.VNP_HASHSECRET?.length);
console.log('VNP_URL:', process.env.VNP_URL);
console.log('VNP_RETURNURL:', process.env.VNP_RETURNURL);

// === API: TẠO URL THANH TOÁN ===
router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipAddr = ip === '::1' ? '127.0.0.1' : ip;
    const createDate = moment().format('YYYYMMDDHHmmss');

    // Tạo OrderInfo đơn giản không có dấu tiếng Việt
    const cleanOrderInfo = orderInfo ? orderInfo.replace(/[^\w\s]/gi, '') : `Thanh toan don hang ${orderId}`;

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId.toString().replace(/[^a-zA-Z0-9]/g, ''),
        vnp_OrderInfo: cleanOrderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_ReturnUrl: vnp_ReturnUrl.trim(),
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
    };

    // Log để debug
    console.log('🔍 Original params:', vnp_Params);
    console.log('🔑 Hash Secret:', vnp_HashSecret);
    console.log('🔑 Hash Secret length:', vnp_HashSecret.length);

    // Sắp xếp params theo thứ tự alphabet
    const sortedParams = {};
    Object.keys(vnp_Params).sort().forEach((key) => {
        sortedParams[key] = vnp_Params[key];
    });

    console.log('📋 Sorted params:', sortedParams);

    // Tạo signData - KHÔNG encode ở đây
    const signData = Object.keys(sortedParams)
        .map(key => `${key}=${sortedParams[key]}`)
        .join('&');

    console.log('🔐 SignData:', signData);

    // Tạo hash
    const hmac = crypto.createHmac('sha512', vnp_HashSecret.trim());
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    console.log('🔑 SecureHash:', signed);

    // Thêm hash vào params
    sortedParams.vnp_SecureHash = signed;

    // Tạo URL - encode khi stringify
    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;

    console.log('✅ Payment URL:', paymentUrl);

    res.json({ paymentUrl });
});

module.exports = router;