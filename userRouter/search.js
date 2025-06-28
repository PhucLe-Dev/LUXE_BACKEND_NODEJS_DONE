const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const SanPhamModel = mongoose.model('san_pham', require('../model/schemaSanPham'));

router.get('/', async (req, res) => {
    const keyword = req.query.q;
    if (!keyword) return res.json([]);

    try {
        const products = await SanPhamModel.find({
            ten_sp: { $regex: keyword, $options: 'i' }
        })
            .limit(5)
            .select('ten_sp slug');

        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

router.get('/find-by-slug', async (req, res) => {
    const { slug } = req.query;

    if (!slug) {
        return res.status(400).json({ error: 'Thiếu slug' });
    }

    try {
        const sanpham = await SanPhamModel.aggregate([
            { $match: { slug: decodeURIComponent(slug) } },
            {
                $lookup: {
                    from: 'thuong_hieu',
                    localField: 'id_thuong_hieu',
                    foreignField: 'id',
                    as: 'thuong_hieu',
                },
            },
            {
                $lookup: {
                    from: 'loai_san_pham',
                    localField: 'id_loai',
                    foreignField: 'id',
                    as: 'loai_san_pham',
                },
            },
            { $unwind: { path: '$thuong_hieu', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loai_san_pham', preserveNullAndEmptyArrays: true } },
        ]);

        if (!sanpham || sanpham.length === 0) {
            return res.json({ data: [] });
        }

        res.json({ data: sanpham });
    } catch (err) {
        console.error('Lỗi khi tìm theo slug:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi tìm sản phẩm theo slug' });
    }
});



module.exports = router;