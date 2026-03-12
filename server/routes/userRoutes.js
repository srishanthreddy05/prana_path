const express = require("express");
const router = express.Router();
const { getUser, updateUser } = require("../models/User");
const { isAuthenticated, isDriver } = require("../middleware/authMiddleware");
const {
  setDriverDutyStatus,
  getUserProfile,
  getUserBookings,
  updateUserProfile,
  cancelBooking,
} = require("../controllers/userController");

// GET /api/users/profile - Get user profile
router.get("/profile", isAuthenticated, getUserProfile);

// PUT /api/users/driver/location - Update driver location
router.put("/driver/location", isAuthenticated, isDriver, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Invalid coordinates" });
    }

    const driver = await getUser(req.user.uid);

    if (!driver) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!driver.onDuty) {
      return res.json({ message: "Driver is off duty; location not stored" });
    }

    const user = await updateUser(req.user.uid, {
      currentLocation: {
        lat,
        lng,
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({ message: "Location updated successfully", user });
  } catch (err) {
    console.error("Error updating driver location:", err);
    res.status(500).json({ message: "Failed to update location" });
  }
});

// PUT /api/users/duty - Set driver duty toggle
router.put("/duty", isAuthenticated, isDriver, setDriverDutyStatus);

// GET /api/users/bookings - Get user's booking history
router.get("/bookings", isAuthenticated, getUserBookings);

// PUT /api/users/profile - Update user profile
router.put("/profile", isAuthenticated, updateUserProfile);

// PUT /api/users/bookings/:id/cancel - Cancel a booking
router.put("/bookings/:id/cancel", isAuthenticated, cancelBooking);

module.exports = router;
