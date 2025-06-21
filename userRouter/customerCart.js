const mongoose = require("mongoose");
const conn = mongoose.createConnection("mongodb://127.0.0.1:27017/fashion_web25");
const express = require("express");
const router = express.Router();
const SanPham = conn.model("san_pham", require("../model/schemaSanPham"));


module.exports = router;