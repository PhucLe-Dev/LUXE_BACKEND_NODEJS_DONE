const mongoose = require('mongoose');

const addressSubSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: false }, // optional
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    specificAddress: { type: String, required: true }, // địa chỉ cụ thể cho tài xế
}, { _id: false });

const diachiSchema = new mongoose.Schema({
    id_customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'nguoi_dung', // hoặc User nếu bạn dùng model đó
        required: true,
        unique: true
    },
    addresses: {
        type: [addressSubSchema],
        validate: {
            validator: function (v) {
                return v.length <= 3;
            },
            message: props => `Tối đa chỉ được lưu 3 địa chỉ nhận hàng!`
        },
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('dia_chi', diachiSchema);

module.exports = diachiSchema;