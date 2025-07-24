const authControllers = require("../controller/authController");
const middlewaresController = require("../controller/middlewaresController");
const router = require("express").Router();

router.post("/register", authControllers.registerUser);

router.post("/login", authControllers.loginUser);

router.post("/logout", authControllers.logoutUser);

router.post("/forgot-password", authControllers.forgotPassword);

router.post("/change-password", authControllers.changePasswordUser);

router.get("/verify-email", authControllers.verifyEmail);

router.post("/refresh-token", authControllers.refreshToken);

router.post("/google-login", authControllers.googleLogin);

router.post("/facebook-login", authControllers.facebookLogin);

router.get('/me', middlewaresController.verifyToken, authControllers.getCurrentUser);

router.put('/update', middlewaresController.verifyToken, authControllers.updateUser);

module.exports = router;