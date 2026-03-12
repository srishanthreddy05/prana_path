/**
 * Socket.IO Event Handlers
 * Manages real-time communication for driver locations and booking updates
 */

const User = require("../models/User");
const Booking = require("../models/Booking");

const LOCATION_TIMEOUT_MS = 60 * 1000; // mark unavailable after 60 seconds of silence

/**
 * Setup socket handlers for the application
 * @param {Server} io - Socket.IO server instance
 */
const setupSocketHandlers = (io) => {
  // Track active driver locations and health
  const driverLocations = new Map();
  const driverTimeouts = new Map();
  const driverDutyCache = new Map();

  const clearLocationTimeout = (driverId) => {
    const timer = driverTimeouts.get(driverId);
    if (timer) clearTimeout(timer);
    driverTimeouts.delete(driverId);
  };

  const markDriverUnavailable = async (driverId, reason = "") => {
    clearLocationTimeout(driverId);
    driverLocations.delete(driverId);
    driverDutyCache.set(driverId, false);

    try {
      await User.findByIdAndUpdate(driverId, { onDuty: false, currentLocation: null });
      console.warn(`Driver ${driverId} marked unavailable${reason ? `: ${reason}` : ""}`);
    } catch (err) {
      console.error("Error marking driver unavailable:", err);
    }
  };

  const scheduleLocationTimeout = (driverId) => {
    clearLocationTimeout(driverId);
    const timerId = setTimeout(() => {
      markDriverUnavailable(driverId, "no location updates");
    }, LOCATION_TIMEOUT_MS);
    driverTimeouts.set(driverId, timerId);
  };

  const ensureDriverOnDuty = async (driverId) => {
    if (!driverId) return false;
    if (driverDutyCache.has(driverId)) {
      return driverDutyCache.get(driverId);
    }

    const driver = await User.findById(driverId).select("onDuty");
    const isOnDuty = !!driver?.onDuty;
    driverDutyCache.set(driverId, isOnDuty);
    return isOnDuty;
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Driver updates their location (only while on duty)
    socket.on("driver:locationUpdate", async (data) => {
      try {
        const { driverId, lat, lng } = data || {};

        if (!driverId || typeof lat !== "number" || typeof lng !== "number") {
          socket.emit("error", { message: "Invalid location payload" });
          return;
        }

        const isOnDuty = await ensureDriverOnDuty(driverId);
        if (!isOnDuty) {
          console.warn(`Ignoring location from off-duty driver ${driverId}`);
          return;
        }

        await User.findByIdAndUpdate(
          driverId,
          {
            currentLocation: {
              lat,
              lng,
              updatedAt: new Date(),
            },
          },
          { new: true }
        );

        driverLocations.set(driverId, { lat, lng, timestamp: Date.now() });
        scheduleLocationTimeout(driverId);

        socket.broadcast.emit("driver:locationUpdate", {
          driverId,
          lat,
          lng,
          timestamp: new Date(),
        });

        console.log(`Driver ${driverId} location updated: ${lat}, ${lng}`);
      } catch (error) {
        console.error("Error updating driver location:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // Driver goes on duty
    socket.on("driver:onDuty", async (data) => {
      try {
        const { driverId } = data || {};
        if (!driverId) {
          socket.emit("error", { message: "driverId is required" });
          return;
        }

        await User.findByIdAndUpdate(driverId, { onDuty: true }, { new: true });
        driverDutyCache.set(driverId, true);
        scheduleLocationTimeout(driverId);

        socket.emit("driver:onDuty:success", {
          message: "You are now on duty",
        });

        console.log(`Driver ${driverId} is now on duty`);
      } catch (error) {
        console.error("Error updating driver status:", error);
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // Driver goes off duty
    socket.on("driver:offDuty", async (data) => {
      try {
        const { driverId } = data || {};
        if (!driverId) {
          socket.emit("error", { message: "driverId is required" });
          return;
        }

        await markDriverUnavailable(driverId, "driver toggled off duty");

        socket.emit("driver:offDuty:success", {
          message: "You are now off duty",
        });

        console.log(`Driver ${driverId} is now off duty`);
      } catch (error) {
        console.error("Error updating driver status:", error);
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // Subscribe to booking updates
    socket.on("booking:subscribe", (data) => {
      const { bookingId, role } = data;
      socket.join(`booking:${bookingId}`);
      console.log(`${role} subscribed to booking:${bookingId}`);
    });

    // Unsubscribe from booking
    socket.on("booking:unsubscribe", (data) => {
      const { bookingId } = data;
      socket.leave(`booking:${bookingId}`);
      console.log(`Client unsubscribed from booking:${bookingId}`);
    });

    // Driver location during active booking
    socket.on("driver:location", (data) => {
      const { bookingId, lat, lng } = data;
      io.to(`booking:${bookingId}`).emit("driver:location", {
        bookingId,
        lat,
        lng,
        timestamp: new Date(),
      });
    });

    // User location during booking
    socket.on("user:location", (data) => {
      const { bookingId, lat, lng } = data;
      io.to(`booking:${bookingId}`).emit("user:location", {
        bookingId,
        lat,
        lng,
        timestamp: new Date(),
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};

/**
 * Notify nearby drivers about a new booking
 * @param {Server} io - Socket.IO server instance
 * @param {Array} nearbyDrivers - Array of nearby driver objects
 * @param {Object} booking - Booking object
 */
const notifyNearbyDrivers = (io, nearbyDrivers, booking) => {
  nearbyDrivers.forEach((driver) => {
    // Emit to all sockets (in case driver has multiple tabs open)
    io.emit("booking:new", {
      bookingId: booking._id,
      pickup: booking.pickup,
      destination: booking.destination,
      pickupLat: booking.pickupLat,
      pickupLng: booking.pickupLng,
      destLat: booking.destLat,
      destLng: booking.destLng,
      etaToPickup: driver.eta,
      distance: driver.distance,
      userPhone: booking.userPhone,
      timestamp: new Date(),
    });
  });
};

/**
 * Notify a specific driver about a booking assignment
 * @param {Server} io - Socket.IO server instance
 * @param {string} driverId - Driver ID
 * @param {Object} booking - Booking object
 */
const notifyDriverAssignment = (io, driverId, booking) => {
  io.emit("booking:assigned", {
    bookingId: booking._id,
    pickup: booking.pickup,
    destination: booking.destination,
    pickupLat: booking.pickupLat,
    pickupLng: booking.pickupLng,
    destLat: booking.destLat,
    destLng: booking.destLng,
    etaToPickup: booking.etaToPickup,
    status: "assigned",
    timestamp: new Date(),
  });
};

module.exports = {
  setupSocketHandlers,
  notifyNearbyDrivers,
  notifyDriverAssignment,
};
