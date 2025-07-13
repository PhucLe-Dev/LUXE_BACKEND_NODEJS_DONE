const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const cors = require('cors');
const admin = require('firebase-admin');
const http = require('http');
const { Server } = require('socket.io');

// Load env
dotenv.config();

// Firebase Admin
const serviceAccount = require('./login-with-google/service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const startServer = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ MongoDB connected');

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: [
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'https://luxe-customer-web-25-local.vercel.app'
        ],
        credentials: true
      }
    });

    // ✅ Truyền socket.io vào request
    app.use((req, res, next) => {
      req.io = io;
      next();
    });

    // 🔌 Socket.io kết nối
    io.on('connection', (socket) => {
      console.log('🔌 Socket connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected:', socket.id);
      });
    });

    const port = 3000;

    // Middleware
    app.use(cookieParser());
    app.use(cors({
      origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'https://luxe-customer-web-25-local.vercel.app'
      ],
      credentials: true
    }));
    app.use(express.json());

    // Test route
    app.get('/', (req, res) => {
      res.json({ thongbao: 'API NodeJS cho fashion_web25' });
    });

    // CUSTOMER ROUTES
    app.use('/api/product', require('./userRouter/userRouteSanPham'));
    app.use('/api/voucher', require('./userRouter/voucherOder'));
    app.use('/api/order', require('./userRouter/orderRoute'));
    app.use('/api/vnpay', require('./userRouter/paymentWithVNPAY'));
    app.use('/api/momo', require('./userRouter/paymentWithMOMO'));
    app.use('/api/search', require('./userRouter/search'));
    app.use('/api/comment', require('./userRouter/commentRoute'));
    app.use('/api/customer', require('./userRouter/customerRoute'));
    app.use('/api/rating', require('./userRouter/ratingRoute'));

    // ADMIN ROUTES
    app.use('/api/admin/san-pham', require('./adminRouter/adminRouterSanPham'));
    app.use('/api/admin/variants', require('./adminRouter/adminRouteVariants'));

    // SHIPPER
    app.use('/api/shipper/order', require('./shipperRouter/donHangRoute'));

    // AUTH
    app.use('/api/auth', require('./routes/auth'));

    // Start server
    server.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });

  } catch (err) {
    console.error('❌ MongoDB connect failed:', err);
    process.exit(1);
  }
};

startServer();
