const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const NguoiDung = mongoose.model('nguoi_dung', require('../model/schemaNguoiDung'));
const DiaChiModel = require('../model/schemaDiaChi');

router.put('/:id', async (req, res) => {
  try {
    const updatedUser = await NguoiDung.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updated_at: Date.now()
      },
      { new: true }
    );
    res.json(updatedUser);
  } catch (error) {
    console.error("Lỗi khi cập nhật người dùng:", error);
    res.status(500).json({ error: 'Cập nhật thất bại' });
  }
});

// API thêm địa chỉ mới cho người dùng
router.post('/add/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { fullName, phoneNumber, email, administrativeAddress, specificAddress } = req.body;

    // Validate input
    if (!fullName || !phoneNumber || !administrativeAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'ID khách hàng không hợp lệ'
      });
    }

    // Tạo địa chỉ mới
    const newAddress = {
      fullName,
      phoneNumber,
      email: email || '',
      administrativeAddress,
      specificAddress: specificAddress || ''
    };

    // Tìm document địa chỉ của khách hàng
    let customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      // Nếu chưa có, tạo mới
      customerAddresses = new DiaChiModel({
        id_customer: customerId,
        addresses: [newAddress]
      });
    } else {
      // Kiểm tra giới hạn 3 địa chỉ
      if (customerAddresses.addresses.length >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Tối đa chỉ được lưu 3 địa chỉ nhận hàng!'
        });
      }

      // Thêm địa chỉ mới vào mảng
      customerAddresses.addresses.push(newAddress);
    }

    // Lưu vào database
    await customerAddresses.save();

    res.status(201).json({
      success: true,
      message: 'Thêm địa chỉ thành công',
      data: customerAddresses
    });

  } catch (error) {
    console.error('Lỗi khi thêm địa chỉ:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi thêm địa chỉ',
      error: error.message
    });
  }
});

// API lấy danh sách địa chỉ của khách hàng
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'ID khách hàng không hợp lệ'
      });
    }

    const customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      return res.status(200).json({
        success: true,
        message: 'Khách hàng chưa có địa chỉ nào',
        data: { addresses: [] }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách địa chỉ thành công',
      data: customerAddresses
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách địa chỉ:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách địa chỉ',
      error: error.message
    });
  }
});

// API xóa địa chỉ
router.delete('/:customerId/:addressIndex', async (req, res) => {
  try {
    const { customerId, addressIndex } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'ID khách hàng không hợp lệ'
      });
    }

    const customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ của khách hàng'
      });
    }

    // Validate index
    const index = parseInt(addressIndex);
    if (isNaN(index) || index < 0 || index >= customerAddresses.addresses.length) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ số địa chỉ không hợp lệ'
      });
    }

    // Xóa địa chỉ
    customerAddresses.addresses.splice(index, 1);
    await customerAddresses.save();

    res.status(200).json({
      success: true,
      message: 'Xóa địa chỉ thành công',
      data: customerAddresses
    });

  } catch (error) {
    console.error('Lỗi khi xóa địa chỉ:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa địa chỉ',
      error: error.message
    });
  }
});

// API cập nhật địa chỉ
router.put('/:customerId/:addressIndex', async (req, res) => {
  try {
    const { customerId, addressIndex } = req.params;
    const { fullName, phoneNumber, email, administrativeAddress, specificAddress } = req.body;

    // Validate input
    if (!fullName || !phoneNumber || !administrativeAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'ID khách hàng không hợp lệ'
      });
    }

    const customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ của khách hàng'
      });
    }

    // Validate index
    const index = parseInt(addressIndex);
    if (isNaN(index) || index < 0 || index >= customerAddresses.addresses.length) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ số địa chỉ không hợp lệ'
      });
    }

    // Cập nhật địa chỉ
    customerAddresses.addresses[index] = {
      fullName,
      phoneNumber,
      email: email || '',
      administrativeAddress,
      specificAddress: specificAddress || ''
    };

    await customerAddresses.save();

    res.status(200).json({
      success: true,
      message: 'Cập nhật địa chỉ thành công',
      data: customerAddresses
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật địa chỉ:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật địa chỉ',
      error: error.message
    });
  }
});

module.exports = router;