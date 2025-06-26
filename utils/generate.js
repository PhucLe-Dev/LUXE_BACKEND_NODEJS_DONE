const slugify  = require('slugify');
const crypto   = require('crypto');
const mongoose = require('mongoose');
const schemaSanPham = require('../model/schemaSanPham');

exports.makeSlug = (name, id) =>
  slugify(`${name}-${id}`, { lower: true, strict: true });

exports.makeSku = async () => {
  while (true) {
    const sku = `${crypto.randomBytes(4).toString('hex').toUpperCase()}_` +
                `${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const exists = await mongoose.model('san_pham', schemaSanPham).exists({ 'variants.sku': sku });
    if (!exists) return sku;
  }
};
