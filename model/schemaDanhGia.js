// model/schemaDanhGia.js
const mongoose = require('mongoose');

const danhGiaSchema = new mongoose.Schema({
    id_customer: { type: mongoose.Schema.Types.ObjectId, ref: 'nguoi_dung', required: true },
    id_variant: { type: mongoose.Schema.Types.ObjectId, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'don_hang' },
    rating: { type: Number, min: 1, max: 5, required: true },
    content: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
}, { collection: 'danh_gia' });

module.exports = mongoose.model('danh_gia', danhGiaSchema);
