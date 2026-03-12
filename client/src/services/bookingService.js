// Booking service for API operations
import { authFetch } from "../utils/api";

export const createBooking = async (bookingData) => {
  const res = await authFetch("/bookings", {
    method: "POST",
    body: JSON.stringify(bookingData),
  });

  if (!res.ok) {
    const errData = await res.json();
    if (res.status === 401) {
      throw new Error("Please login to book an ambulance.");
    }
    throw new Error(errData.message || "Failed to book ambulance");
  }

  return await res.json();
};

export const getBookingById = async (bookingId) => {
  const res = await authFetch(`/bookings/${bookingId}`);

  if (!res.ok) {
    throw new Error("Unable to load booking details");
  }

  return await res.json();
};

export const checkPendingBooking = async () => {
  const res = await authFetch("/bookings/pending-check");

  if (!res.ok) {
    return { hasPendingBooking: false, booking: null };
  }

  return await res.json();
};
export const cancelBooking = async (bookingId) => {
  const res = await authFetch(`/bookings/${bookingId}/cancel`, {
    method: "PUT",
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || "Failed to cancel booking");
  }

  return await res.json();
};
