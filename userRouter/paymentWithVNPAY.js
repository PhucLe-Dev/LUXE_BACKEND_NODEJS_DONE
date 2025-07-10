const express = require('express');
const moment = require('moment');
const crypto = require('crypto');
const qs = require('qs');

const router = express.Router();

// === THÔNG TIN CẤU HÌNH VNPay (Hardcoded theo bạn cung cấp) ===
const vnp_TmnCode = '5F6U2XP5';
const vnp_HashSecret = 'X52DQXDT260B45XEEBS51Z5IITZBOSZM';
const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = 'https://luxe-customer-web-25-local.vercel.app/payment';

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
    vnp_ReturnUrl,
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
