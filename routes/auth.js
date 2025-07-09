const authControllers = require("../controller/authController");
const middlewaresController = require("../controller/middlewaresController");
const router = require("express").Router();

router.post("/register", authControllers.registerUser);

router.get("/verify-email", authControllers.verifyEmail);

router.post("/login", authControllers.loginUser);

router.post("/refresh-token", authControllers.refreshToken);

router.post("/logout", authControllers.logoutUser);

router.post("/forgot-password", authControllers.forgotPassword);

router.post("/change-password", authControllers.changePasswordUser);

router.post("/google-login", authControllers.googleLogin);

router.post("/facebook-login", authControllers.facebookLogin);

router.get('/me', middlewaresController.verifyToken, authControllers.getCurrentUser);

router.put('/update', middlewaresController.verifyToken, authControllers.updateUser);

const orderController = require('../adminRouter/orderController');
const { verifyToken, verifyAdmin } = require('../controller/middlewaresController');
router.get('/', verifyToken, verifyAdmin, orderController.getAllOrders);
router.put('/:id/status', verifyToken, verifyAdmin, orderController.updateOrderStatus);
router.get('/:id', verifyToken, orderController.getOrderDetails);
module.exports = router;