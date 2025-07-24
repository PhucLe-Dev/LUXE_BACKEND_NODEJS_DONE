const jwt = require("jsonwebtoken");
const { blacklistedAccessTokens } = require('./authController');

const middlewaresController = {
    // verify token middleware
    verifyToken: (req, res, next) => {
        const token = req.headers.authorization;
        if (token) {
            const accessToken = token.split(" ")[1];
            if (blacklistedAccessTokens.has(accessToken)) {
                return res.status(401).json({ message: 'Token đã bị thu hồi' });
            }
            jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, (err, user) => {
                if (err) {
                    return res.status(403).json({ message: "Token không hợp lệ" });
                }
                req.user = user; // Lưu thông tin người dùng vào request
                next(); // Tiếp tục xử lý request
            })
        }
        else {
            return res.status(401).json({ message: "Bạn chưa đăng nhập" });
        }
    },

    // // ======================== CODE MỚI THÊM VÀO ========================
  // Middleware xác thực vai trò Admin
  verifyAdmin: (req, res, next) => {
    // Middleware này phải được gọi sau verifyToken
    if (req.user && req.user.vai_tro === "admin") {
      next(); // Nếu là admin, cho phép đi tiếp
    } else {
      // Nếu không phải admin, trả về lỗi 403 Forbidden
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập chức năng này" });
    }
  },

  // Middleware xác thực vài trò Shipper
  verifyShipper: (req, res, next) => {
    // Middleware này phải được gọi sau verifyToken
    if (req.user && req.user.vai_tro === "shipper") {
      next(); // Nếu là shipper, cho phép đi tiếp
    } else {
      // Nếu không phải shipper, trả về lỗi 403 Forbidden
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập chức năng này" });
    }
  },

  // ====================== KẾT THÚC CODE MỚI THÊM ======================
};
module.exports = middlewaresController;

