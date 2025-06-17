const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin');

// Khởi tạo Firebase Admin SDK
const serviceAccount = require('./login-with-google/service-account-key.json'); 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

dotenv.config();

mongoose.createConnection(process.env.DATABASE_URL);

const app = express();
const port = 3000;


app.use(cookieParser());

app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'], // Mảng các origin
  credentials: true // Cho phép gửi cookie
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ thongbao: 'API NodeJS cho fashion_web25'});
});

// Router cho user
const userRouterSP = require('./userRouter/userRouteSanPham');
app.use('/api/user', userRouterSP);

// Router cho addmin
const adminRouterSP = require('./adminRouter/adminRouterSanPham');
app.use('/api/admin/san-pham/', adminRouterSP);
const adminRouterVariants = require('./adminRouter/adminRouteVariants');
app.use('/api/admin/variants/', adminRouterVariants);

// Router cho shipper 
const shipperRouterDonHang = require('./shipperRouter/donHangRoute');
app.use('/api/shipper/order', shipperRouterDonHang);

// Các router viết chung ở đây
const authRoute = require('./routes/auth');
app.use('/api/auth', authRoute);

// Khởi động server
app.listen(port, () => {
  console.log(`Ứng dụng đang chạy trên port ${port}`);
});