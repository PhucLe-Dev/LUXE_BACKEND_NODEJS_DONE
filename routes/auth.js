const authControllers = require("../controller/authController");
const middlewaresController = require("../controller/middlewaresController");
const router = require("express").Router();

router.post("/register", authControllers.registerUser);

router.post("/login", authControllers.loginUser);

router.post("/refresh-token", authControllers.refreshToken);

router.post("/logout", middlewaresController.verifyToken, authControllers.logoutUser);
module.exports = router;