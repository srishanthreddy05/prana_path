const { getBookingsByAlertedPolice, getBooking } = require("../models/Booking");

// Get all accepted bookings alerted to this police officer
const getAcceptedBookings = async (req, res) => {
  try {
    const bookings = await getBookingsByAlertedPolice(req.user.uid);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get single booking by ID (for police booking detail page)
const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await getBooking(bookingId);

    if (
      !booking ||
      booking.status !== "accepted" ||
      !booking.alertedPolice ||
      !booking.alertedPolice[req.user.uid]
    ) {
      return res.status(404).json({ message: "Booking not found or has been completed" });
    }

    res.json(booking);
  } catch (err) {
    console.error("Error fetching booking:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getAcceptedBookings, getBookingById };