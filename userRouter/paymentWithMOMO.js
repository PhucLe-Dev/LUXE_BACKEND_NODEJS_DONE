const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

require('dotenv').config();

router.post('/create', async (req, res) => {
    const { amount, orderId, orderInfo, redirectUrl, ipnUrl } = req.body;

    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secretKey = process.env.MOMO_SECRET_KEY;

    const requestId = orderId;
    const requestType = 'captureWallet';

    const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
    const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

    const requestBody = {
        partnerCode,
        accessKey,
        requestId,
        amount,
        orderId,
        orderInfo,
        redirectUrl,
        ipnUrl,
        requestType,
        signature,
        lang: 'vi',
        extraData: ''
    };

    try {
        const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/create', requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Lỗi tạo thanh toán Momo:', error);
        res.status(500).json({ message: 'Lỗi khi gọi API Momo', error: error.message });
    }
});

module.exports = router;
