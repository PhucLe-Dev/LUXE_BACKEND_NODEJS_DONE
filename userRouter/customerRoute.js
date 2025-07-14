const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const NguoiDung = mongoose.model('nguoi_dung', require('../model/schemaNguoiDung'));
const DiaChiModel = require('../model/schemaDiaChi'); // Import model DiaChi

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

    let customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      // Nếu chưa có địa chỉ nào cho khách hàng này, tạo mới
      customerAddresses = new DiaChiModel({
        id_customer: customerId,
        addresses: []
      });
    }

    // Thêm địa chỉ mới vào mảng
    customerAddresses.addresses.push({
      fullName,
      phoneNumber,
      email: email || '',
      administrativeAddress,
      specificAddress: specificAddress || ''
    });

    // Lưu cập nhật
    await customerAddresses.save();

    res.status(200).json({
      success: true,
      message: 'Thêm địa chỉ thành công',
      data: customerAddresses
    });

  } catch (error) {
    console.error("Lỗi khi thêm địa chỉ:", error);
    // Xử lý lỗi validate array length nếu có
    if (error.name === 'ValidationError' && error.message.includes('addresses')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi thêm địa chỉ.'
    });
  }
});

// API cập nhật địa chỉ đã lưu của người dùng
router.put('/:customerId/address/:addressIndex', async (req, res) => {
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
    console.error("Lỗi khi cập nhật địa chỉ:", error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật địa chỉ.'
    });
  }
});

// API xóa địa chỉ đã lưu của người dùng
router.delete('/:customerId/address/:addressIndex', async (req, res) => {
  try {
    const { customerId, addressIndex } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
    }

    const customerAddresses = await DiaChiModel.findOne({ id_customer: customerId });

    if (!customerAddresses) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ của khách hàng' });
    }

    const index = parseInt(addressIndex);
    if (isNaN(index) || index < 0 || index >= customerAddresses.addresses.length) {
      return res.status(400).json({ success: false, message: 'Chỉ số địa chỉ không hợp lệ' });
    }

    customerAddresses.addresses.splice(index, 1); // Xóa địa chỉ tại vị trí index
    await customerAddresses.save();

    res.status(200).json({ success: true, message: 'Xóa địa chỉ thành công', data: customerAddresses.addresses });

  } catch (error) {
    console.error("Lỗi khi xóa địa chỉ:", error);
    res.status(500).json({ success: false, message: 'Lỗi server khi xóa địa chỉ.' });
  }
});


// API LẤY TẤT CẢ ĐỊA CHỈ ĐÃ LƯU CỦA NGƯỜI DÙNG 
router.get('/:customerId/addresses', async (req, res) => {
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
      // Trả về mảng rỗng nếu không tìm thấy địa chỉ nào cho khách hàng này
      return res.status(200).json({
        success: true,
        data: [] // Trả về mảng rỗng thay vì lỗi 404
      });
    }

    res.status(200).json({
      success: true,
      data: customerAddresses.addresses
    });

  } catch (error) {
    console.error("Lỗi khi lấy địa chỉ của khách hàng:", error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy địa chỉ.'
    });
  }
});


module.exports = router;