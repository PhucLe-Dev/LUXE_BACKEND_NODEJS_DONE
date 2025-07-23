const express = require("express");
const crypto = require("crypto");
const qs = require("qs");
const router = express.Router();

// Thông tin từ VNPay Sandbox
const vnpayConfig = {
    vnp_TmnCode: process.env.VNPAY_TMN_CODE || "M1QHIL6B",
    vnp_HashSecret: process.env.VNPAY_HASH_SECRET || "413AH0HME2AQVHO602PBLH336GMDIOVX",
    vnp_Url: process.env.VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    vnp_Api: process.env.VNPAY_API || "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL || "http://localhost:3003/payment"
};

// Hàm sắp xếp object theo key
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

// Tạo URL thanh toán VNPay
router.post("/create", (req, res) => {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        
        let date = new Date();
        let createDate = date.toISOString().slice(0, 19).replace(/-/g, '').replace('T', '').replace(/:/g, '');
        
        let ipAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);

        let tmnCode = vnpayConfig.vnp_TmnCode;
        let secretKey = vnpayConfig.vnp_HashSecret;
        let vnpUrl = vnpayConfig.vnp_Url;
        let returnUrl = vnpayConfig.vnp_ReturnUrl;
        let orderId = req.body.orderId || Date.now().toString();
        let amount = req.body.amount || 100000;
        let bankCode = req.body.bankCode || '';
        
        let locale = req.body.language || 'vn';
        let currCode = 'VND';
        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        vnp_Params['vnp_Locale'] = locale;
        vnp_Params['vnp_CurrCode'] = currCode;
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = 'Thanh toan don hang LUXE ' + orderId;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = amount * 100; // VNPay tính bằng đồng
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_CreateDate'] = createDate;
        if (bankCode !== null && bankCode !== '') {
            vnp_Params['vnp_BankCode'] = bankCode;
        }

        vnp_Params = sortObject(vnp_Params);

        let querystring = qs.stringify(vnp_Params, { encode: false });
        let signData = querystring;
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");
        vnp_Params['vnp_SecureHash'] = signed;
        vnpUrl += '?' + qs.stringify(vnp_Params, { encode: false });

        console.log('VNPay URL:', vnpUrl);
        
        res.json({
            success: true,
            paymentUrl: vnpUrl,
            orderId: orderId
        });
    } catch (error) {
        console.error('VNPay create payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi tạo link thanh toán VNPay',
            error: error.message
        });
    }
});

// Xử lý callback từ VNPay
router.get("/return", (req, res) => {
    try {
        let vnp_Params = req.query;
        let secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        let secretKey = vnpayConfig.vnp_HashSecret;
        let querystring = qs.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(querystring, 'utf-8')).digest("hex");

        if (secureHash === signed) {
            let orderId = vnp_Params['vnp_TxnRef'];
            let rspCode = vnp_Params['vnp_ResponseCode'];
            
            console.log('VNPay return params:', vnp_Params);
            
            if (rspCode === '00') {
                // Thanh toán thành công
                res.redirect(`http://localhost:3003/payment?vnp_ResponseCode=00&vnp_TxnRef=${orderId}`);
            } else {
                // Thanh toán thất bại
                res.redirect(`http://localhost:3003/payment?vnp_ResponseCode=${rspCode}&vnp_TxnRef=${orderId}`);
            }
        } else {
            res.redirect(`http://localhost:3003/payment?vnp_ResponseCode=97`); // Sai chữ ký
        }
    } catch (error) {
        console.error('VNPay return error:', error);
        res.redirect(`http://localhost:3003/payment?vnp_ResponseCode=99`); // Lỗi khác
    }
});

// IPN (Instant Payment Notification) - Webhook từ VNPay
router.post("/ipn", (req, res) => {
    try {
        let vnp_Params = req.query;
        let secureHash = vnp_Params['vnp_SecureHash'];

        let orderId = vnp_Params['vnp_TxnRef'];
        let rspCode = vnp_Params['vnp_ResponseCode'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        let secretKey = vnpayConfig.vnp_HashSecret;
        let querystring = qs.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(querystring, 'utf-8')).digest("hex");

        console.log('VNPay IPN params:', vnp_Params);

        if (secureHash === signed) {
            if (rspCode === '00') {
                // Thanh toán thành công, cập nhật database
                console.log('VNPay IPN: Payment successful for order:', orderId);
                res.status(200).json({ RspCode: '00', Message: 'success' });
            } else {
                // Thanh toán thất bại
                console.log('VNPay IPN: Payment failed for order:', orderId);
                res.status(200).json({ RspCode: '00', Message: 'success' });
            }
        } else {
            res.status(200).json({ RspCode: '97', Message: 'Fail checksum' });
        }
    } catch (error) {
        console.error('VNPay IPN error:', error);
        res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
});

// Query payment status
router.post("/query", (req, res) => {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        let date = new Date();

        let vnp_TmnCode = vnpayConfig.vnp_TmnCode;
        let secretKey = vnpayConfig.vnp_HashSecret;
        let vnp_Api = vnpayConfig.vnp_Api;

        let vnp_TxnRef = req.body.orderId;
        let vnp_TransactionDate = req.body.transDate;

        let vnp_RequestId = date.getTime();
        let vnp_Version = '2.1.0';
        let vnp_Command = 'querydr';
        let vnp_OrderInfo = 'Truy van GD:' + vnp_TxnRef;

        let vnp_IpAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);

        let currCode = 'VND';
        let vnp_CreateDate = date.toISOString().slice(0, 19).replace(/-/g, '').replace('T', '').replace(/:/g, '');

        let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TxnRef + "|" + vnp_TransactionDate + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;

        let hmac = crypto.createHmac("sha512", secretKey);
        let vnp_SecureHash = hmac.update(new Buffer(data, 'utf-8')).digest("hex");

        let dataObj = {
            'vnp_RequestId': vnp_RequestId,
            'vnp_Version': vnp_Version,
            'vnp_Command': vnp_Command,
            'vnp_TmnCode': vnp_TmnCode,
            'vnp_TxnRef': vnp_TxnRef,
            'vnp_OrderInfo': vnp_OrderInfo,
            'vnp_TransactionDate': vnp_TransactionDate,
            'vnp_CreateDate': vnp_CreateDate,
            'vnp_IpAddr': vnp_IpAddr,
            'vnp_SecureHash': vnp_SecureHash
        };

        res.json(dataObj);
    } catch (error) {
        console.error('VNPay query error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi truy vấn thanh toán VNPay',
            error: error.message
        });
    }
});

module.exports = router;