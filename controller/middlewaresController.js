const jwt = require("jsonwebtoken");

const middlewaresController = {
    // verify token middleware
    verifyToken: (req, res, next) => {
        const token = req.headers.token;
        if (token) {
            const accessToken = token.split(" ")[1];
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
}
module.exports = middlewaresController;

