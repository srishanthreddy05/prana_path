const express = require("express");
const router = express.Router();
const { isAuthenticated, isDriver, isAmbulanceResponder } = require("../middleware/authMiddleware");
const { requireCompleteProfile } = require("../middleware/profileMiddleware");
const {
  getBookingById,
  getPendingBookings,
  acceptBooking,
  completeBooking,
  getDriverBookings,
} = require("../controllers/bookingController");
const {
  createBooking,
  getBooking,
  updateBooking,
  getPendingBookings: getPendingBookingsFb,
  getBookingsByUser,
} = require("../models/Booking");
const { getUser } = require("../models/User");

// ---------------- User Routes ----------------

// POST /api/bookings → create new booking
router.post("/", isAuthenticated, requireCompleteProfile, async (req, res) => {
  try {
    const { pickup, destination, pickupLat, pickupLng, destLat, destLng } = req.body;

    const SEARCH_TIMEOUT_MS = 90 * 1000;
    const cutoffTime = Date.now() - SEARCH_TIMEOUT_MS;

    // Check if user already has an active pending booking
    const userBookings = await getBookingsByUser(req.user.uid);
    const existingPendingBooking = userBookings.find(
      (b) => b.status === "pending" && b.timestamp >= cutoffTime
    );

    if (existingPendingBooking) {
      return res.status(400).json({
        message: "You already have a pending booking. Please wait for a driver to accept it.",
        existingBooking: existingPendingBooking,
      });
    }

    // Cancel any stale pending bookings
    const staleBookings = userBookings.filter(
      (b) => b.status === "pending" && b.timestamp < cutoffTime
    );
    for (const b of staleBookings) {
      await updateBooking(b.id, { status: "cancelled" });
    }

    const booking = await createBooking({
      userId: req.user.uid,
      userDisplayName: req.user.displayName || req.user.username || "",
      userMobile: req.user.mobile || req.user.mobileNumber || "",
      pickup,
      destination,
      pickupLat,
      pickupLng,
      destLat,
      destLng,
    });

    res.status(201).json({ message: "Booking created", booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookings → fetch all bookings of logged-in user
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const bookings = await getBookingsByUser(req.user.uid);
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/bookings/:id/cancel → cancel a booking (user)
router.put("/:id/cancel", isAuthenticated, async (req, res) => {
  try {
    const booking = await getBooking(req.params.id);

    if (
      !booking ||
      booking.userId !== req.user.uid ||
      !["pending", "accepted"].includes(booking.status)
    ) {
      return res.status(404).json({ message: "Booking not found or cannot be cancelled" });
    }

    console.log(`📢 Cancelling booking ${booking.id}, status: ${booking.status}`);
    const hadDriver = booking.driverId;
    const updated = await updateBooking(booking.id, { status: "cancelled" });

    const io = req.app.get("io");
    if (io && hadDriver) {
      io.to(`booking:${booking.id}`).emit("bookingCancelled", {
        bookingId: booking.id,
        message: "Booking has been cancelled by the user",
      });
    }

    res.json({ message: "Booking cancelled successfully", booking: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookings/pending-check → check if user has a pending booking
router.get("/pending-check", isAuthenticated, async (req, res) => {
  try {
    const SEARCH_TIMEOUT_MS = 90 * 1000;
    const cutoffTime = Date.now() - SEARCH_TIMEOUT_MS;

    const userBookings = await getBookingsByUser(req.user.uid);
    const pendingBooking = userBookings.find(
      (b) => b.status === "pending" && b.timestamp >= cutoffTime
    );

    res.json({
      hasPendingBooking: !!pendingBooking,
      booking: pendingBooking || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------- Driver Routes ----------------

// GET /api/bookings/pending → pending bookings for drivers AND ambulance volunteers
router.get("/pending", isAuthenticated, isAmbulanceResponder, getPendingBookings);

// GET /api/bookings/driver → driver's accepted/completed bookings
router.get("/driver", isAuthenticated, isDriver, getDriverBookings);

// PUT /api/bookings/:id/accept → accept a booking (driver or ambulance volunteer)
router.put("/:id/accept", isAuthenticated, isAmbulanceResponder, acceptBooking);

// PUT /api/bookings/:id/complete → complete a booking
router.put("/:id/complete", isAuthenticated, isDriver, completeBooking);

// PUT /api/bookings/:id/driver-cancel → cancel a booking (by driver)
router.put("/:id/driver-cancel", isAuthenticated, isDriver, async (req, res) => {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking || booking.driverId !== req.user.uid || booking.status !== "accepted") {
      return res.status(404).json({ message: "Booking not found or cannot be cancelled" });
    }

    // Reset to pending so user can search again
    const updated = await updateBooking(booking.id, {
      status: "pending",
      driverId: null,
      driverName: null,
      driverMobile: null,
      driverVehicle: null,
      timestamp: Date.now(), // Reset so it doesn't timeout immediately
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`booking:${booking.id}`).emit("booking:driver-cancelled", {
        bookingId: booking.id,
        message: "Driver has cancelled. Searching for a new ambulance...",
      });
    }

    res.json({
      message: "Booking cancelled. User will be notified to search for another driver.",
      booking: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookings/:id/police-locations → police locations for a booking (for driver)
router.get("/:id/police-locations", isAuthenticated, isDriver, async (req, res) => {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking || booking.driverId !== req.user.uid) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const alertedPoliceUids = booking.alertedPolice
      ? Object.keys(booking.alertedPolice).filter((uid) => booking.alertedPolice[uid])
      : [];

    if (alertedPoliceUids.length === 0) {
      return res.json([]);
    }

    const { getAllUsers } = require("../models/User");
    const allUsers = await getAllUsers();
    const policeLocations = allUsers
      .filter(
        (u) =>
          alertedPoliceUids.includes(u.uid) &&
          u.currentLocation &&
          u.currentLocation.lat &&
          u.currentLocation.lng
      )
      .map((p) => ({
        id: p.uid,
        lat: p.currentLocation.lat,
        lng: p.currentLocation.lng,
        name: p.displayName || "Police Officer",
        station: p.station || "Police Station",
      }));

    res.json(policeLocations);
  } catch (err) {
    console.error("Error fetching police locations:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookings/:id → fetch one booking (for user)
router.get("/:id", isAuthenticated, getBookingById);

module.exports = router;
