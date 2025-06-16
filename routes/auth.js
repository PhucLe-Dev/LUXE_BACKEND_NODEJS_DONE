const authControllers = require("../controller/authController");
const middlewaresController = require("../controller/middlewaresController");
const router = require("express").Router();

router.post("/register", authControllers.registerUser);

router.get("/verify-email", authControllers.verifyEmail);

router.post("/login", authControllers.loginUser);

router.post("/refresh-token", authControllers.refreshToken);

router.post("/logout", middlewaresController.verifyToken, authControllers.logoutUser);

router.post("/forgot-password", authControllers.forgotPassword);

router.post("/change-password", middlewaresController.verifyToken, authControllers.changePasswordUser);

module.exports = router;