// ======================== FILE MỚI HOÀN TOÀN ========================
const DonHang = require('../model/schemaDonHang'); // Sử dụng model đơn hàng bạn đã cung cấp
const NguoiDung = require('../model/schemaNguoiDung'); // Model người dùng để kiểm tra shipper
const mongoose = require('mongoose');

const orderController = {
    /**
     * [ADMIN] Lấy tất cả đơn hàng
     * GET /api/order
     */
    getAllOrders: async (req, res) => {
        try {
            const orders = await mongoose.model('don_hang', DonHang).find()
                .populate('id_customer', 'ho_ten email')
                .sort({ created_at: -1 });
            res.status(200).json(orders);
        } catch (error) {
            res.status(500).json({ message: `Lỗi server: ${error.message}` });
        }
    },

    /**
     * [ADMIN & CUSTOMER] Lấy chi tiết một đơn hàng
     * GET /api/order/:id
     */
    getOrderDetails: async (req, res) => {
        try {
            const order = await mongoose.model('don_hang', DonHang).findOne({ ma_don_hang: req.params.id })
                .populate('id_customer', 'ho_ten email sdt')
                .populate('id_shipper', 'ho_ten email sdt');

            if (!order) {
                return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
            }
            res.status(200).json(order);
        } catch (error) {
            res.status(500).json({ message: `Lỗi server: ${error.message}` });
        }
    },

    /**
     * [ADMIN] Cập nhật trạng thái đơn hàng và gán shipper
     * PUT /api/order/:id/status
     */
    updateOrderStatus: async (req, res) => {
        try {
            const { trang_thai_don_hang, id_shipper } = req.body;
            if (!trang_thai_don_hang) {
                return res.status(400).json({ message: 'Vui lòng cung cấp trạng thái mới' });
            }

            const order = await mongoose.model('don_hang', DonHang).findOne({ ma_don_hang: req.params.id });
            if (!order) {
                return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
            }

            order.trang_thai_don_hang = trang_thai_don_hang;

            if (id_shipper) {
                const shipper = await mongoose.model('nguoi_dung', NguoiDung).findById(id_shipper);
                if (!shipper) {
                    return res.status(404).json({ message: 'ID Shipper không tồn tại' });
                }
                order.id_shipper = id_shipper;
            }

            const updatedOrder = await order.save();
            res.status(200).json({ message: 'Cập nhật trạng thái thành công', order: updatedOrder });
        } catch (error) {
            res.status(500).json({ message: `Lỗi server: ${error.message}` });
        }
    },
};

module.exports = orderController;
// ====================== KẾT THÚC FILE MỚI ======================