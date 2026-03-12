/**
 * Volunteer Routes
 * Handles ambulance volunteer and traffic volunteer opt-in/opt-out,
 * location updates, pending booking access, and traffic alert requests.
 */

const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/authMiddleware");
const { getUser, updateUser, getAllUsers } = require("../models/User");
const { getPendingBookings } = require("../models/Booking");
const { distanceInMeters } = require("../utils/geoUtils");
const { alertNearbyTrafficVolunteers } = require("../services/trafficAlertService");

const VALID_VOLUNTEER_TYPES = ["ambulance_volunteer", "traffic_volunteer"];

// ── POST /api/volunteers/join ─────────────────────────────────────────────────
// Opt-in as a volunteer (ambulance or traffic).
router.post("/join", isAuthenticated, async (req, res) => {
  try {
    const { volunteerType } = req.body;

    if (!VALID_VOLUNTEER_TYPES.includes(volunteerType)) {
      return res.status(400).json({
        message: "Invalid volunteerType. Must be ambulance_volunteer or traffic_volunteer.",
      });
    }

    // Users with a professional role (driver / police) cannot register as a volunteer.
    if (req.user.role !== "user") {
      return res.status(403).json({
        message: "Only regular users can register as volunteers.",
      });
    }

    const updated = await updateUser(req.user.uid, {
      volunteerRole: volunteerType,
      volunteerActive: true,
      volunteerJoinedAt: Date.now(),
    });

    res.json({
      message: `You are now registered as a ${volunteerType.replace(/_/g, " ")}.`,
      user: updated,
    });
  } catch (err) {
    console.error("Error joining volunteer program:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/volunteers/leave ────────────────────────────────────────────────
// Opt-out from the volunteer program.
router.post("/leave", isAuthenticated, async (req, res) => {
  try {
    const updated = await updateUser(req.user.uid, {
      volunteerRole: null,
      volunteerActive: false,
    });

    res.json({ message: "You have left the volunteer program.", user: updated });
  } catch (err) {
    console.error("Error leaving volunteer program:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/volunteers/location ─────────────────────────────────────────────
// Update the current location of an active volunteer (used for proximity checks).
router.put("/location", isAuthenticated, async (req, res) => {
  try {
    const user = await getUser(req.user.uid);

    if (!user?.volunteerRole || !user?.volunteerActive) {
      return res.status(403).json({ message: "Not an active volunteer." });
    }

    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "lat and lng must be numbers." });
    }

    await updateUser(req.user.uid, {
      currentLocation: { lat, lng, updatedAt: new Date().toISOString() },
    });

    res.json({ message: "Location updated." });
  } catch (err) {
    console.error("Error updating volunteer location:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/volunteers/bookings ──────────────────────────────────────────────
// Pending bookings within 15 km – for ambulance volunteers only.
router.get("/bookings", isAuthenticated, async (req, res) => {
  try {
    const user = await getUser(req.user.uid);

    if (user?.volunteerRole !== "ambulance_volunteer" || !user?.volunteerActive) {
      return res.status(403).json({ message: "Not an active ambulance volunteer." });
    }

    const volLat = user?.currentLocation?.lat;
    const volLng = user?.currentLocation?.lng;

    if (typeof volLat !== "number" || typeof volLng !== "number") {
      return res.json([]); // no location → no bookings shown
    }

    const RADIUS_KM = 15;
    const bookings = await getPendingBookings();

    const nearby = bookings.filter((b) => {
      if (typeof b.pickupLat !== "number" || typeof b.pickupLng !== "number") return false;
      return distanceInMeters(volLat, volLng, b.pickupLat, b.pickupLng) / 1000 <= RADIUS_KM;
    });

    res.json(nearby);
  } catch (err) {
    console.error("Error fetching volunteer bookings:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/volunteers/alert-traffic ───────────────────────────────────────
// Driver manually requests traffic volunteers near their current position.
router.post("/alert-traffic", isAuthenticated, async (req, res) => {
  try {
    const { lat, lng, bookingId } = req.body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "lat and lng must be numbers." });
    }

    const io = req.app.get("io");
    const count = await alertNearbyTrafficVolunteers(lat, lng, bookingId, io, distanceInMeters);

    res.json({
      message: `Alerted ${count} traffic volunteer(s) near your location.`,
      count,
    });
  } catch (err) {
    console.error("Error alerting traffic volunteers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
