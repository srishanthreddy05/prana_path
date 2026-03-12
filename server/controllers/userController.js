const { getUser, updateUser, getAllUsers } = require("../models/User");
const { getBookingsByUser } = require("../models/Booking");

// ✅ Set driver duty status
const setDriverDutyStatus = async (req, res) => {
  try {
    const { onDuty } = req.body;
    if (typeof onDuty !== "boolean") {
      return res.status(400).json({ message: "onDuty must be boolean" });
    }

    if (onDuty) {
      const user = await getUser(req.user.uid);
      if (!user || (!user.mobile && !user.mobileNumber)) {
        return res.status(400).json({ message: "Mobile number is required to go on duty" });
      }
    }

    const updates = { onDuty };
    if (!onDuty) updates.currentLocation = null;

    const user = await updateUser(req.user.uid, updates);
    res.json({ message: onDuty ? "Driver is now on duty" : "Driver is off duty", user });
  } catch (err) {
    console.error("Error updating duty status:", err);
    res.status(500).json({ message: "Failed to update duty status" });
  }
};

// ✅ Get user profile
const getUserProfile = async (req, res) => {
  try {
    const user = await getUser(req.user.uid);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
};

// ✅ Get user's booking history
const getUserBookings = async (req, res) => {
  try {
    const bookings = await getBookingsByUser(req.user.uid);
    res.json(bookings);
  } catch (err) {
    console.error("Error fetching user bookings:", err);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
};

// ✅ Update user profile (shared across roles)
const updateUserProfile = async (req, res) => {
  try {
    const {
      username, displayName, name, mobile, mobileNumber,
      dob, dateOfBirth, bloodGroup, station, area,
      pincode, vehicleNumber, profilePhoto, currentLocation,
    } = req.body;

    const updates = {};

    if (typeof username === "string" && username.trim()) updates.username = username.trim();
    if (typeof displayName === "string") {
      updates.displayName = displayName.trim();
      updates.name = displayName.trim();
    }
    if (typeof name === "string") {
      updates.name = name.trim();
      updates.displayName = name.trim();
    }
    if (typeof mobile === "string") {
      updates.mobile = mobile.trim();
      updates.mobileNumber = mobile.trim();
    }
    if (typeof mobileNumber === "string") {
      updates.mobileNumber = mobileNumber.trim();
      updates.mobile = mobileNumber.trim();
    }
    if (typeof bloodGroup === "string") updates.bloodGroup = bloodGroup.trim();
    if (typeof station === "string") updates.station = station.trim();
    if (typeof area === "string") updates.area = area.trim();
    if (typeof pincode === "string") updates.pincode = pincode.trim();
    if (typeof vehicleNumber === "string") updates.vehicleNumber = vehicleNumber.trim();
    if (profilePhoto !== undefined) updates.profilePhoto = profilePhoto;

    const dobInput = dateOfBirth ?? dob;
    if (dobInput) {
      const parsedDob = new Date(dobInput);
      if (Number.isNaN(parsedDob.getTime())) {
        return res.status(400).json({ message: "Invalid date of birth" });
      }
      updates.dob = parsedDob.toISOString();
      updates.dateOfBirth = parsedDob.toISOString();
    }

    if (currentLocation) {
      const { lat, lng, label } = currentLocation;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ message: "Invalid location coordinates" });
      }
      updates.currentLocation = { lat, lng, label: label || "" };
    }

    const user = await updateUser(req.user.uid, updates);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    console.error("Error updating user profile:", err);
    res.status(500).json({ message: "Failed to update user profile" });
  }
};

// ✅ Cancel a pending booking
const cancelBooking = async (req, res) => {
  try {
    const { updateBooking, getBooking } = require("../models/Booking");
    const booking = await getBooking(req.params.id);

    if (!booking || booking.userId !== req.user.uid) {
      return res.status(404).json({ message: "Booking not found or unauthorized" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({ message: "Only pending bookings can be cancelled" });
    }

    const updated = await updateBooking(req.params.id, { status: "cancelled" });
    res.json({ message: "Booking cancelled successfully", booking: updated });
  } catch (err) {
    console.error("Error cancelling booking:", err);
    res.status(500).json({ message: "Failed to cancel booking" });
  }
};

module.exports = {
  setDriverDutyStatus,
  getUserProfile,
  getUserBookings,
  updateUserProfile,
  cancelBooking,
};
