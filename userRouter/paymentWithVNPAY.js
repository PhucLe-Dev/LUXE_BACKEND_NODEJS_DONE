const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// ✅ Thay bằng thông tin từ sandbox mới
const vnp_TmnCode = 'REGMMAYQ';
const vnp_HashSecret = 'JL74UD9LLAUO61D8DHYRC3W64GVJV06G';
const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = 'https://fe-user-fashion-25-zsys.vercel.app/payment'; // đổi 127.0.0.1 nếu cần

router.post('/create', (req, res) => {
    const { amount, orderId, orderInfo } = req.body;

    const ipAddr = '127.0.0.1';
    const createDate = moment().format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode,
        vnp_Amount: Math.round(Number(amount) * 100),
        vnp_CurrCode: 'VND',
        vnp_Locale: 'vn',
        vnp_TxnRef: orderId.trim(),
        vnp_OrderInfo: Buffer.from(orderInfo.replace('#', '').trim(), 'utf8').toString(),
        vnp_OrderType: 'other',
        vnp_ReturnUrl: vnp_ReturnUrl.trim(),
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate
    };

    // ✅ Sort tham số
    const sortedParams = {};
    Object.keys(vnp_Params).sort().forEach((key) => {
        sortedParams[key] = vnp_Params[key];
    });

    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', vnp_HashSecret.trim());
    const signed = hmac.update(signData).digest('hex');

    sortedParams.vnp_SecureHash = signed;
    sortedParams.vnp_SecureHashType = 'SHA512';

    const paymentUrl = `${vnp_Url}?${qs.stringify(sortedParams, { encode: true })}`;
    console.log("✅ SignData:", signData);
    console.log("🔗 Payment URL:", paymentUrl);

    res.json({ paymentUrl });
});

module.exports = router;
