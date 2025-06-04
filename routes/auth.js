const authControllers = require("../controller/authController");
const router = require("express").Router();

router.post("/register", authControllers.registerUser);

router.post("/login", authControllers.loginUser);

router.post("/refresh-token", authControllers.refreshToken);

module.exports = router;