const express = require('express');
const router = express.Router();
const moment = require('moment');
const qs = require('qs');
const crypto = require('crypto');
require('dotenv').config();

router.post('/create', (req, res) => {
  const { amount, orderId, orderInfo } = req.body;

  const tmnCode = process.env.VNP_TMNCODE;
  const secretKey = process.env.VNP_HASH_SECRET;
  const vnpUrl = process.env.VNP_URL;
  const returnUrl = process.env.VNP_RETURN_URL;

  const vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Amount: amount * 100, // VNPay yêu cầu nhân 100
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: req.ip || '127.0.0.1',
    vnp_CreateDate: moment().format('YYYYMMDDHHmmss')
  };

  // Sắp xếp tham số theo thứ tự alphabet
  const sortedParams = {};
  Object.keys(vnp_Params).sort().forEach((key) => {
    sortedParams[key] = vnp_Params[key];
  });

  const signData = qs.stringify(sortedParams, { encode: false });
  const hmac = crypto.createHmac('sha512', secretKey);
  const signed = hmac.update(signData).digest('hex');
  sortedParams.vnp_SecureHash = signed;

  const paymentUrl = `${vnpUrl}?${qs.stringify(sortedParams, { encode: true })}`;
  res.json({ paymentUrl });
});

module.exports = router;
