const {
  createBooking,
  getBooking,
  updateBooking,
  getPendingBookings,
  getBookingsByDriver,
} = require("../models/Booking");
const { getUser } = require("../models/User");
const { distanceInMeters } = require("../utils/geoUtils");
const { notifyPoliceIfRoutePasses } = require("../services/policeAlertService");
const { alertVolunteersAndPublicOnRoute } = require("../services/trafficAlertService");
const { getRoute } = require("../services/directionsService");

const missingLocationWarningTsByDriver = new Map();

// Get single booking for the authenticated user
const getBookingById = async (req, res) => {
  try {
    const booking = await getBooking(req.params.id);
    if (!booking || booking.userId !== req.user.uid) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get all pending bookings (for drivers and ambulance volunteers)
const getPendingBookingsHandler = async (req, res) => {
  try {
    const driver = await getUser(req.user.uid);
    const isVolunteer = driver?.volunteerRole === "ambulance_volunteer" && driver?.volunteerActive === true;

    if (!isVolunteer && !driver?.onDuty) {
      console.warn(`Pending bookings fetch skipped — driver ${req.user.uid} is off duty`);
      return res.json([]);
    }

    const driverLat = driver?.currentLocation?.lat;
    const driverLng = driver?.currentLocation?.lng;

    if (typeof driverLat !== "number" || typeof driverLng !== "number") {
      const now = Date.now();
      const lastWarnedAt = missingLocationWarningTsByDriver.get(req.user.uid) || 0;
      if (now - lastWarnedAt > 60 * 1000) {
        console.warn(`Pending bookings fetch skipped — missing driver location for ${req.user.uid}`);
        missingLocationWarningTsByDriver.set(req.user.uid, now);
      }
      return res.json([]);
    }

    // Location is now available; clear throttle state for this driver.
    if (missingLocationWarningTsByDriver.has(req.user.uid)) {
      missingLocationWarningTsByDriver.delete(req.user.uid);
    }

    const RADIUS_KM = 15;
    const bookings = await getPendingBookings();

    const nearbyBookings = bookings.filter((booking) => {
      if (typeof booking.pickupLat !== "number" || typeof booking.pickupLng !== "number") {
        return false;
      }
      const distanceKm =
        distanceInMeters(driverLat, driverLng, booking.pickupLat, booking.pickupLng) / 1000;
      return distanceKm <= RADIUS_KM;
    });

    res.json(nearbyBookings);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Accept a booking (driver or ambulance volunteer)
const acceptBooking = async (req, res) => {
  try {
    const responder = await getUser(req.user.uid);
    const isVolunteer =
      responder?.volunteerRole === "ambulance_volunteer" && responder?.volunteerActive === true;

    if (!isVolunteer && !responder?.onDuty) {
      return res.status(403).json({ message: "Driver must be on duty to accept bookings" });
    }

    const booking = await updateBooking(req.params.id, {
      status: "accepted",
      driverId: req.user.uid,
      driverName: responder.displayName || responder.username || "",
      driverMobile: responder.mobile || responder.mobileNumber || "",
      driverVehicle: responder.vehicleNumber || (isVolunteer ? "Volunteer Vehicle" : ""),
      isVolunteerResponse: isVolunteer,
    });

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(`booking:${booking.id}`).emit("booking:accepted", {
        bookingId: booking.id,
        driver: {
          uid: req.user.uid,
          username: responder.displayName || responder.username,
          mobile: responder.mobile || responder.mobileNumber,
          vehicleNumber: responder.vehicleNumber || (isVolunteer ? "Volunteer Vehicle" : ""),
          isVolunteer: isVolunteer,
        },
        status: booking.status,
      });
    }

    // Get route and notify nearby police + traffic volunteers
    const bookingId = booking?.id || booking?._id || req.params.id;
    const route = await getRoute(booking.pickupLat, booking.pickupLng, booking.destLat, booking.destLng);
    if (route?.overview_polyline?.points) {
      await notifyPoliceIfRoutePasses(booking, route.overview_polyline.points, io);
      await alertVolunteersAndPublicOnRoute(booking, route.overview_polyline.points, io);
    } else {
      console.warn(`⚠️ Route notifications skipped — no route for booking ${bookingId}`);
    }

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Complete a booking (driver only)
const completeBooking = async (req, res) => {
  try {
    const existing = await getBooking(req.params.id);
    if (!existing || existing.driverId !== req.user.uid || existing.status !== "accepted") {
      return res.status(404).json({ message: "Booking not found or not authorized" });
    }

    const booking = await updateBooking(req.params.id, { status: "completed" });

    const io = req.app.get("io");
    if (io) {
      io.to(`booking:${booking.id}`).emit("booking:completed", {
        bookingId: booking.id,
        status: booking.status,
      });
      io.emit("booking:completed", {
        bookingId: booking.id,
        status: booking.status,
      });
    }

    res.json({ message: "Booking completed successfully", booking });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get driver's accepted/completed bookings
const getDriverBookings = async (req, res) => {
  try {
    const bookings = await getBookingsByDriver(req.user.uid);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getBookingById,
  getPendingBookings: getPendingBookingsHandler,
  acceptBooking,
  completeBooking,
  getDriverBookings,
};
