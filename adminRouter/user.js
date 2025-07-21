const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const middlewaresController = require("../controller/middlewaresController");
const NguoiDung = mongoose.model("nguoi_dung");

// ======================================================
// Lấy danh sách người dùng (có thể lọc theo vai trò)
// Path: GET /admin/users?vai_tro=shipper
// ======================================================
router.get(
    "/users",
    middlewaresController.verifyToken,
    middlewaresController.verifyAdmin,
    async (req, res) => {
        try {
            const { vai_tro } = req.query;
            const query = {};
            if (vai_tro) {
                query.vai_tro = vai_tro;
            }

            // Chỉ lấy những trường cần thiết cho dropdown
            const users = await NguoiDung.find(query).select('_id ho_ten').lean();

            res.status(200).json({ success: true, data: users });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Lỗi server khi lấy danh sách người dùng.",
                error: error.message,
            });
        }
    }
);

module.exports = router;