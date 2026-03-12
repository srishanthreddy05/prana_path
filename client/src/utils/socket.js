import { io } from "socket.io-client";

let socketInstance = null;

// Backend socket URL
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  "https://smart-ambulance-w3i0.onrender.com";

/**
 * Get or create socket instance
 */
export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"],
    });

    socketInstance.on("connect", () => {
      console.log("🔌 Socket connected:", socketInstance.id);
    });

    socketInstance.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });
  }
  return socketInstance;
}

/**
 * -----------------------------
 * BOOKING ROOMS (User / Driver)
 * -----------------------------
 */

// Join booking room (user or driver)
export function joinBookingRoom(bookingId, role) {
  const socket = getSocket();
  socket.emit("booking:subscribe", { bookingId, role });
  console.log(`📦 ${role} joined booking:${bookingId}`);
}

// Booking accepted
export function onBookingAccepted(handler) {
  const socket = getSocket();
  socket.off("booking:accepted"); // prevent duplicates
  socket.on("booking:accepted", handler);
}

// Booking completed
export function onBookingCompleted(handler) {
  const socket = getSocket();
  socket.off("booking:completed");
  socket.on("booking:completed", handler);
}

// Booking cancelled by driver (user should re-search)
export function onDriverCancelled(handler) {
  const socket = getSocket();
  socket.off("booking:driver-cancelled");
  socket.on("booking:driver-cancelled", handler);
}

/**
 * -----------------------------
 * DRIVER ↔ USER LOCATION
 * -----------------------------
 */

// Receive driver location
export function onDriverLocation(handler) {
  const socket = getSocket();
  socket.off("driver:location");
  socket.on("driver:location", handler);
}

// Driver sends location
export function emitDriverLocation(bookingId, lat, lng) {
  const socket = getSocket();
  socket.emit("driver:location", { bookingId, lat, lng });
}

// User sends location
export function emitUserLocation(bookingId, lat, lng) {
  const socket = getSocket();
  socket.emit("user:location", { bookingId, lat, lng });
}

// Driver receives user location
export function onUserLocation(handler) {
  const socket = getSocket();
  socket.off("user:location");
  socket.on("user:location", handler);
}

/**
 * -----------------------------
 * POLICE ROOMS (CRITICAL FIX)
 * -----------------------------
 */

// Police joins OWN isolated room
export function joinPoliceRoom(policeId) {
  const socket = getSocket();
  socket.emit("police:join", policeId);
  console.log(`👮 Joined police room: police:${policeId}`);
}

// Police receives ambulance alert
export function onPoliceAlert(handler) {
  const socket = getSocket();
  socket.off("police:ambulance-alert");
  socket.on("police:ambulance-alert", handler);
}

/**
 * -----------------------------
 * USER ROOMS (For Blood Hub)
 * -----------------------------
 */

// User joins OWN isolated room
export function joinUserRoom(userId) {
  const socket = getSocket();
  socket.emit("user:join", userId);
  console.log(`👤 Joined user room: user:${userId}`);
}

// User receives blood request notification
export function onBloodRequest(handler) {
  const socket = getSocket();
  socket.off("blood:request");
  socket.on("blood:request", handler);
}

// User receives blood request accepted notification
export function onBloodAccepted(handler) {
  const socket = getSocket();
  socket.off("blood:accepted");
  socket.on("blood:accepted", handler);
}

// Blood donation completed notification
export function onBloodCompleted(handler) {
  const socket = getSocket();
  socket.off("blood:completed");
  socket.on("blood:completed", handler);
}

// Blood request cancelled notification
export function onBloodCancelled(handler) {
  const socket = getSocket();
  socket.off("blood:cancelled");
  socket.on("blood:cancelled", handler);
}

/**
 * -----------------------------
 * DISCONNECT
 * -----------------------------
 */

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
