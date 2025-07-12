const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DonHang = mongoose.model('don_hang', require('../model/schemaDonHang'));
const SanPham = mongoose.model('san_pham', require('../model/schemaSanPham'));


router.get("/all-product", async (req, res) => {
  try {
    const products = await SanPham.find();
    res.json({
      success: true,
      message: "Lấy danh sách sản phẩm thành công!",
      data: products
    });
  } catch (err) {
    console.error("Lỗi khi lấy sản phẩm:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy sản phẩm."
    });
  }
});

// Hàm sinh mã đơn hàng duy nhất
const generateUniqueOrderCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    const randomCode = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    code = `DH${randomCode}`;
    const existing = await DonHang.findOne({ ma_don_hang: code });
    if (!existing) exists = false;
  }

  return code;
};

router.post("/", async (req, res) => {
  try {
    const data = req.body;

    // Tự tạo mã đơn hàng duy nhất
    const ma_don_hang = await generateUniqueOrderCode();

    const newOrder = new DonHang({
      ...data,
      ma_don_hang,
      trang_thai_don_hang: "Chờ xác nhận", // mặc định
    });

    await newOrder.save();

    // Nếu có voucher, cập nhật trạng thái không hoạt động
    if (data.id_voucher) {
      const Voucher = mongoose.model('voucher', require('../model/schemaVoucher'));
      await Voucher.findByIdAndUpdate(data.id_voucher, { is_active: false });
    }

    res.json({
      success: true,
      message: "Tạo đơn hàng thành công!",
      data: newOrder
    });
  } catch (err) {
    console.error("Lỗi tạo đơn hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
  }
});

// API lấy tất cả đơn hàng theo id_customer
router.get("/customer/:id_customer", async (req, res) => {
  try {
    const { id_customer } = req.params;
    const { status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id_customer)) {
      return res.status(400).json({ success: false, message: "ID khách hàng không hợp lệ." });
    }

    const query = { id_customer };
    if (status) {
      query.trang_thai_don_hang = status;
    }

    const orders = await DonHang.find(query)
      .populate('id_customer', 'ho_ten email')
      .populate('id_voucher', 'ma_voucher')
      .sort({ created_at: -1 });

    if (!orders || orders.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
    }

    res.json({ success: true, message: "Lấy danh sách đơn hàng thành công!", data: orders });
  } catch (err) {
    console.error("Lỗi khi lấy danh sách đơn hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// API hủy đơn hàng theo ID
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "ID không hợp lệ." });
    }

    const order = await DonHang.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
    }

    // Không cho hủy nếu đã quá bước "Đã xác nhận"
    const cancelableStatuses = ["Chờ xác nhận", "Đã xác nhận"];
    if (!cancelableStatuses.includes(order.trang_thai_don_hang)) {
      return res.status(400).json({ success: false, message: "Đơn hàng không thể hủy ở trạng thái hiện tại." });
    }

    order.trang_thai_don_hang = "Hủy đơn hàng";
    await order.save();

    res.json({ success: true, message: "Đã hủy đơn hàng thành công!", data: order });
  } catch (err) {
    console.error("Lỗi khi hủy đơn:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi hủy đơn hàng." });
  }
});

// API lấy chi tiết đơn hàng theo ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID đơn hàng không hợp lệ.",
      });
    }

    const order = await DonHang.findById(id)
      .populate("id_customer", "ho_ten email")
      .populate("id_voucher", "code");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng.",
      });
    }

    res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công!",
      data: order,
    });
  } catch (err) {
    console.error("Lỗi khi lấy chi tiết đơn hàng:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết đơn hàng.",
    });
  }
});

// API xuất hóa đơn PDF cho đơn hàng
router.get("/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "ID đơn hàng không hợp lệ." });
    }

    const order = await DonHang.findById(id)
      .populate("id_customer", "ho_ten email sdt")
      .populate("id_voucher", "code giam_gia");

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
    }

    if (order.trang_thai_don_hang !== "Giao hàng thành công") {
      return res.status(400).json({
        success: false,
        message: "Chỉ đơn hàng đã giao thành công mới có thể xuất hóa đơn.",
      });
    }

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, left: 40, right: 40, bottom: 40 },
    });

    // Đăng ký font (nếu có)
    let hasCustomFont = false;
    try {
      const fontPath = "fonts/static/Roboto-Regular.ttf";
      const fontBoldPath = "fonts/static/Roboto-Bold.ttf";
      doc.registerFont("Roboto", fontPath);
      doc.registerFont("Roboto-Bold", fontBoldPath);
      hasCustomFont = true;
    } catch (error) {
      console.log("Sử dụng font mặc định");
    }

    const regularFont = hasCustomFont ? "Roboto" : "Helvetica";
    const boldFont = hasCustomFont ? "Roboto-Bold" : "Helvetica-Bold";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=hoa_don_${order.ma_don_hang}.pdf`
    );
    doc.pipe(res);

    // === HELPER FUNCTIONS ===
    const pageWidth = doc.page.width - 80; // Trừ margin
    const leftMargin = 40;
    const rightMargin = doc.page.width - 40;

    const formatCurrency = (amount) => {
      if (!amount && amount !== 0) return "0 ₫";
      return new Intl.NumberFormat('vi-VN').format(amount) + " ₫";
    };

    const formatDate = (date) => {
      if (!date) return "";
      return new Date(date).toLocaleString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    const drawLine = (x1, y1, x2, y2, color = "#CCCCCC", width = 0.5) => {
      doc.strokeColor(color).lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke();
    };

    const drawBox = (x, y, width, height, fillColor = null, strokeColor = null, radius = 0) => {
      if (fillColor) {
        if (radius > 0) {
          doc.fillColor(fillColor).roundedRect(x, y, width, height, radius).fill();
        } else {
          doc.fillColor(fillColor).rect(x, y, width, height).fill();
        }
      }
      if (strokeColor) {
        doc.strokeColor(strokeColor).roundedRect(x, y, width, height, radius).stroke();
      }
    };

    // === HEADER SECTION ===
    let yPos = 40;

    // Logo và tên shop
    doc.fillColor("#2563EB")
      .fontSize(32)
      .font(boldFont)
      .text("LUXE", leftMargin, yPos);

    doc.fillColor("#64748B")
      .fontSize(11)
      .font(regularFont)
      .text("FASHION BOUTIQUE", leftMargin, yPos + 35);

    // Thông tin liên hệ (bên phải)
    const contactInfo = [
      "123 Nguyễn Huệ, Quận 1, TP.HCM",
      "Hotline: 1900 1234",
      "Email: support@luxe.vn",
      "Website: www.luxe.vn"
    ];

    doc.fillColor("#64748B").fontSize(10);
    contactInfo.forEach((info, index) => {
      doc.text(info, leftMargin + 300, yPos + (index * 12), {
        width: 200,
        align: "right"
      });
    });

    // Đường kẻ phân cách
    yPos += 80;
    drawLine(leftMargin, yPos, rightMargin, yPos, "#E2E8F0", 1);
    yPos += 20;

    // === INVOICE TITLE ===
    doc.fillColor("#1E293B")
      .fontSize(24)
      .font(boldFont)
      .text("HÓA ĐƠN BÁN HÀNG", leftMargin, yPos);

    yPos += 40;

    // Thông tin đơn hàng
    doc.fillColor("#475569")
      .fontSize(11)
      .font(regularFont)
      .text(`Mã đơn hàng: `, leftMargin, yPos);

    doc.fillColor("#1E293B")
      .font(boldFont)
      .text(order.ma_don_hang, leftMargin + 85, yPos);

    if (order.created_at) {
      doc.fillColor("#475569")
        .font(regularFont)
        .text(`Ngày tạo: `, leftMargin + 300, yPos);

      doc.fillColor("#1E293B")
        .font(boldFont)
        .text(formatDate(order.created_at), leftMargin + 350, yPos, {
          width: 200,
          align: "right"
        });
    }

    yPos += 30;

    // === CUSTOMER SECTION ===
    // Background box
    drawBox(leftMargin, yPos, pageWidth, 100, "#F8FAFC", "#E2E8F0", 8);

    yPos += 15;

    doc.fillColor("#1E293B")
      .fontSize(13)
      .font(boldFont)
      .text("THÔNG TIN KHÁCH HÀNG", leftMargin + 15, yPos);

    yPos += 20;

    // Customer info
    const customerFields = [
      { label: "Họ tên:", value: order.ho_ten },
      { label: "Email:", value: order.email },
      { label: "Điện thoại:", value: order.sdt },
      { label: "Địa chỉ:", value: order.dia_chi_giao_hang }
    ];

    customerFields.forEach((field) => {
      if (field.value) {
        doc.fillColor("#475569")
          .fontSize(10)
          .font(regularFont)
          .text(field.label, leftMargin + 15, yPos);

        doc.fillColor("#1E293B")
          .font(boldFont)
          .text(field.value, leftMargin + 80, yPos, {
            width: pageWidth - 100,
            lineGap: 2
          });

        yPos += 15;
      }
    });

    yPos += 15;

    // === PAYMENT SECTION ===
    if (order.phuong_thuc_thanh_toan || order.trang_thai_thanh_toan) {
      drawBox(leftMargin, yPos, pageWidth, 60, "#FEF3C7", "#F59E0B", 8);

      yPos += 15;

      doc.fillColor("#92400E")
        .fontSize(13)
        .font(boldFont)
        .text("THÔNG TIN THANH TOÁN", leftMargin + 15, yPos);

      yPos += 20;

      if (order.phuong_thuc_thanh_toan) {
        doc.fillColor("#92400E")
          .fontSize(10)
          .font(regularFont)
          .text("Phương thức:", leftMargin + 15, yPos);

        doc.font(boldFont)
          .text(order.phuong_thuc_thanh_toan, leftMargin + 100, yPos);
      }

      if (order.trang_thai_thanh_toan) {
        doc.fillColor("#92400E")
          .fontSize(10)
          .font(regularFont)
          .text("Trạng thái:", leftMargin + 280, yPos);

        doc.font(boldFont)
          .text(order.trang_thai_thanh_toan, leftMargin + 350, yPos);
      }

      yPos += 30;
    }

    // === PRODUCT TABLE ===
    yPos += 20;

    doc.fillColor("#1E293B")
      .fontSize(14)
      .font(boldFont)
      .text("CHI TIẾT SẢN PHẨM", leftMargin, yPos);

    yPos += 25;

    // Table header
    drawBox(leftMargin, yPos, pageWidth, 35, "#475569");

    const colPositions = {
      stt: leftMargin + 10,
      product: leftMargin + 40,
      variant: leftMargin + 240,
      qty: leftMargin + 350,
      price: leftMargin + 410,
      total: leftMargin + 480
    };

    const colWidths = {
      stt: 25,
      product: 190,
      variant: 100,
      qty: 50,
      price: 60,
      total: 70
    };

    doc.fillColor("#FFFFFF")
      .fontSize(10)
      .font(boldFont)
      .text("STT", colPositions.stt, yPos + 12)
      .text("Sản phẩm", colPositions.product, yPos + 12)
      .text("Màu sắc / Size", colPositions.variant, yPos + 12)
      .text("SL", colPositions.qty, yPos + 12, { width: colWidths.qty, align: "center" })
      .text("Đơn giá", colPositions.price, yPos + 12, { width: colWidths.price, align: "right" })
      .text("Thành tiền", colPositions.total, yPos + 12, { width: colWidths.total, align: "right" });

    yPos += 35;

    // === GET PRODUCT DATA ===
    const productMap = {};
    const products = await SanPham.find();
    for (const sp of products) {
      for (const variant of sp.variants) {
        productMap[String(variant._id)] = {
          ten_sp: sp.ten_sp,
          mau_sac: variant.mau_sac,
          kich_thuoc: variant.kich_thuoc,
          gia: variant.gia,
          gia_km: variant.gia_km,
        };
      }
    }

    // Table rows
    let totalAmount = 0;
    let rowIndex = 1;

    if (order.variants && order.variants.length > 0) {
      order.variants.forEach((item, index) => {
        const sp = productMap[String(item.id_variant)];
        if (!sp) return;

        const donGia = sp.gia_km || sp.gia;
        const thanhTien = donGia * item.so_luong;
        totalAmount += thanhTien;

        // Alternate row colors
        if (index % 2 === 0) {
          drawBox(leftMargin, yPos, pageWidth, 25, "#F8FAFC");
        }

        doc.fillColor("#374151")
          .fontSize(9)
          .font(regularFont)
          .text(rowIndex, colPositions.stt, yPos + 8)
          .text(sp.ten_sp, colPositions.product, yPos + 8, {
            width: colWidths.product - 10,
            ellipsis: true
          })
          .text(`${sp.mau_sac} / ${sp.kich_thuoc}`, colPositions.variant, yPos + 8)
          .text(item.so_luong.toString(), colPositions.qty, yPos + 8, {
            width: colWidths.qty,
            align: "center"
          })
          .text(formatCurrency(donGia), colPositions.price, yPos + 8, {
            width: colWidths.price,
            align: "right"
          })
          .text(formatCurrency(thanhTien), colPositions.total, yPos + 8, {
            width: colWidths.total,
            align: "right"
          });

        yPos += 25;
        rowIndex++;
      });
    }

    // === TOTAL SECTION ===
    yPos += 20;

    const totalBoxX = leftMargin + 300;
    const totalBoxWidth = pageWidth - 300;

    // Background for totals
    drawBox(totalBoxX, yPos, totalBoxWidth, 90, "#F8FAFC", "#E2E8F0", 8);

    yPos += 15;

    // Subtotal
    doc.fillColor("#64748B")
      .fontSize(11)
      .font(regularFont)
      .text("Tạm tính:", totalBoxX + 15, yPos);

    doc.fillColor("#1E293B")
      .font(boldFont)
      .text(formatCurrency(totalAmount), totalBoxX + 15, yPos, {
        width: totalBoxWidth - 30,
        align: "right"
      });

    yPos += 18;

    // Voucher discount
    let discountAmount = 0;
    if (order.id_voucher && order.id_voucher.giam_gia) {
      discountAmount = order.id_voucher.giam_gia;
      doc.fillColor("#DC2626")
        .fontSize(11)
        .font(regularFont)
        .text(`Giảm giá (${order.id_voucher.code}):`, totalBoxX + 15, yPos);

      doc.text(`-${formatCurrency(discountAmount)}`, totalBoxX + 15, yPos, {
        width: totalBoxWidth - 30,
        align: "right"
      });

      yPos += 18;
    }

    // Shipping fee
    const shippingFee = 0;
    doc.fillColor("#64748B")
      .fontSize(11)
      .font(regularFont)
      .text("Phí vận chuyển:", totalBoxX + 15, yPos);

    doc.fillColor("#1E293B")
      .font(boldFont)
      .text(formatCurrency(shippingFee), totalBoxX + 15, yPos, {
        width: totalBoxWidth - 30,
        align: "right"
      });

    yPos += 20;

    // Final total
    drawLine(totalBoxX + 15, yPos, totalBoxX + totalBoxWidth - 15, yPos, "#64748B", 1);
    yPos += 10;

    const finalTotal = totalAmount - discountAmount + shippingFee;
    doc.fillColor("#1E293B")
      .fontSize(13)
      .font(boldFont)
      .text("TỔNG CỘNG:", totalBoxX + 15, yPos);

    doc.fillColor("#DC2626")
      .fontSize(14)
      .text(formatCurrency(finalTotal), totalBoxX + 15, yPos, {
        width: totalBoxWidth - 30,
        align: "right"
      });

    // === FOOTER ===
    yPos += 60;

    // Thank you box
    drawBox(leftMargin, yPos, pageWidth, 40, "#FEF3C7", "#F59E0B", 8);

    doc.fillColor("#92400E")
      .fontSize(13)
      .font(boldFont)
      .text("CẢM ƠN QUÝ KHÁCH ĐÃ MUA SẮM TẠI LUXE!", leftMargin, yPos + 15, {
        width: pageWidth,
        align: "center"
      });

    yPos += 60;

    // Terms
    const terms = [
      "• Hóa đơn này được tạo tự động bởi hệ thống",
      "• Quý khách vui lòng kiểm tra kỹ thông tin trước khi sử dụng",
      "• Mọi thắc mắc xin liên hệ hotline 1900 1234 hoặc email support@luxe.vn"
    ];

    doc.fillColor("#64748B")
      .fontSize(9)
      .font(regularFont);

    terms.forEach((term, index) => {
      doc.text(term, leftMargin, yPos + (index * 12));
    });

    yPos += 50;

    // Page footer
    doc.fillColor("#94A3B8")
      .fontSize(8)
      .text(`Trang 1/1 - Tạo lúc: ${new Date().toLocaleString('vi-VN')}`, leftMargin, yPos, {
        width: pageWidth,
        align: "center"
      });

    doc.end();

  } catch (err) {
    console.error("Lỗi tạo hóa đơn PDF:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi tạo hóa đơn." });
  }
});

module.exports = router;