const express = require("express");
const router = express.Router();
const { isAuthenticated, isPolice } = require("../middleware/authMiddleware");
const { getAcceptedBookings, getBookingById } = require("../controllers/policeController");

// GET /api/police/bookings → get all accepted bookings
router.get("/bookings", isAuthenticated, isPolice, getAcceptedBookings);

// GET /api/police/booking/:bookingId → get single booking details
router.get("/booking/:bookingId", isAuthenticated, isPolice, getBookingById);

module.exports = router;
