const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin');

// Load env
dotenv.config();

// Firebase Admin
const serviceAccount = require('./login-with-google/service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Kết nối MongoDB
const startServer = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('MongoDB connected');

    const app = express();
    const port = 3000;

    app.use(cookieParser());

    app.use(cors({
      origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'https://fe-user-fashion-25.vercel.app'],
      credentials: true
    }));

    app.use(express.json());

    app.get('/', (req, res) => {
      res.json({ thongbao: 'API NodeJS cho fashion_web25' });
    });

    // USER
    app.use('/api/user', require('./userRouter/userRouteSanPham'));
    app.use('/api/voucher', require('./userRouter/voucherOder'));
    app.use('/api/order', require('./userRouter/orderRoute'));
    app.use('/api/vnpay', require('./userRouter/paymentWithVNPAY'));

    // ADMIN
    app.use('/api/admin/san-pham', require('./adminRouter/adminRouterSanPham'));
    app.use('/api/admin/variants', require('./adminRouter/adminRouteVariants'));

    // SHIPPER
    app.use('/api/shipper/order', require('./shipperRouter/donHangRoute'));

    // AUTH
    app.use('/api/auth', require('./routes/auth'));

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

  } catch (err) {
    console.error('MongoDB connect failed:', err);
    process.exit(1);
  }
};

startServer();
