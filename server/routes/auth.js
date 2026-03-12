const express = require("express");
const { googleLogin, logout } = require("../controllers/authController");
const { isAuthenticated } = require("../middleware/authMiddleware");

const router = express.Router();

// Google Sign-In: receives Firebase ID token, upserts user, returns user data
router.post("/google", googleLogin);

// Logout (client-side sign-out; server just acknowledges)
router.post("/logout", isAuthenticated, logout);

module.exports = router;
