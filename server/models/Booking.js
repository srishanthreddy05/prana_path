const { db } = require("../config/firebase");

const bookingsRef = db.ref("bookings");

const normalizeBooking = (key, data = {}) => {
  const resolvedId = data.id || data._id || key;

  const normalizedUser = data.user || {
    uid: data.userId || "",
    username: data.userDisplayName || data.userName || "",
    mobile: data.userMobile || data.userPhone || "",
  };

  const normalizedDriver = data.driver || {
    uid: data.driverId || "",
    username: data.driverName || "",
    mobile: data.driverMobile || "",
    vehicleNumber: data.driverVehicle || "",
  };

  return {
    ...data,
    id: resolvedId,
    _id: resolvedId,
    user: normalizedUser,
    driver: normalizedDriver,
  };
};

/**
 * Create a new booking and return it with its generated id
 */
const createBooking = async (data) => {
  const ref = bookingsRef.push();
  const id = ref.key;
  const booking = {
    id,
    _id: id,
    ...data,
    timestamp: Date.now(),
    status: data.status || "pending",
  };
  await ref.set(booking);
  return normalizeBooking(id, booking);
};

/**
 * Get a single booking by id
 */
const getBooking = async (id) => {
  const snap = await bookingsRef.child(id).once("value");
  if (!snap.exists()) return null;
  return normalizeBooking(id, snap.val());
};

/**
 * Update (merge) fields on a booking
 */
const updateBooking = async (id, data) => {
  await bookingsRef.child(id).update(data);
  const snap = await bookingsRef.child(id).once("value");
  if (!snap.exists()) return null;
  return normalizeBooking(id, snap.val());
};

/**
 * Get all bookings for a specific user (uid)
 */
const getBookingsByUser = async (uid) => {
  const snap = await bookingsRef.orderByChild("userId").equalTo(uid).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => normalizeBooking(id, data[id]))
    .sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Get all pending bookings
 */
const getPendingBookings = async () => {
  const snap = await bookingsRef.orderByChild("status").equalTo("pending").once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data).map((id) => normalizeBooking(id, data[id]));
};

/**
 * Get all bookings assigned to a driver
 */
const getBookingsByDriver = async (uid) => {
  const snap = await bookingsRef.orderByChild("driverId").equalTo(uid).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => normalizeBooking(id, data[id]))
    .sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Get all pending bookings alerted to a specific police uid
 */
const getBookingsByAlertedPolice = async (policeUid) => {
  // alertedPolice is stored as an object map { uid: true }
  const snap = await bookingsRef.once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => normalizeBooking(id, data[id]))
    .filter((b) => b.status === "accepted" && b.alertedPolice && b.alertedPolice[policeUid])
    .sort((a, b) => b.timestamp - a.timestamp);
};

module.exports = {
  createBooking,
  getBooking,
  updateBooking,
  getBookingsByUser,
  getPendingBookings,
  getBookingsByDriver,
  getBookingsByAlertedPolice,
};
