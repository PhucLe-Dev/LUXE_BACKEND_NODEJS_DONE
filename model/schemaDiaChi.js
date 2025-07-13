const mongoose = require('mongoose');

const addressSubSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String },
    administrativeAddress: { type: String, required: true },
    specificAddress: { type: String }
}, { _id: false });

const diachiSchema = new mongoose.Schema({
    id_customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'nguoi_dung',
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
}, { timestamps: true, collection: 'dia_chi' });

module.exports = mongoose.model('dia_chi', diachiSchema); 
