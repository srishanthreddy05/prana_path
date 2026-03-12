// src/pages/MyBookings.js
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import { authFetch } from "../utils/api";
import "../styles/MyBookings.css";

function MyBookings({ showToast }) {
  const [toasts, setToasts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const showToastLocal = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  // Fetch user's booking history
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await authFetch("/users/bookings");
        if (res.ok) {
          const data = await res.json();
          setBookings(data);
        } else {
          showToastLocal("Failed to load booking history", "error");
        }
      } catch (err) {
        console.error("Failed to fetch bookings:", err);
        showToastLocal("Failed to load booking history", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [showToastLocal]);

  // Cancel booking
  const cancelBooking = async (bookingId) => {
    try {
      const res = await authFetch(`/users/bookings/${bookingId}/cancel`, {
        method: "PUT",
      });

      if (res.ok) {
        showToastLocal("Booking cancelled successfully", "success");
        setBookings((prev) =>
          prev.map((b) =>
            b._id === bookingId ? { ...b, status: "cancelled" } : b
          )
        );
      } else {
        const errorData = await res.json();
        showToastLocal(errorData.message || "Failed to cancel booking", "error");
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      showToastLocal("Failed to cancel booking", "error");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "#ffc107";
      case "accepted":
        return "#17a2b8";
      case "completed":
        return "#28a745";
      case "cancelled":
        return "#dc3545";
      default:
        return "#6c757d";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "pending":
        return "⏳ Pending";
      case "accepted":
        return "✅ Accepted";
      case "completed":
        return "🎉 Completed";
      case "cancelled":
        return "❌ Cancelled";
      default:
        return "❓ Unknown";
    }
  };

  return (
    <div className="mybookings-page">
      <h1>My Ambulance Bookings</h1>
      <p>View and manage your emergency requests</p>
      <button className="book-btn" onClick={() => navigate("/bookAmbulance")}>
        🚑 Book New Ambulance
      </button>

      <div className="booking-history">
        <h2>Booking History</h2>

        {loading ? (
          <p>Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <div className="no-bookings">
            <h3>No Bookings Found</h3>
            <p>You haven't made any ambulance bookings yet. Start by booking your first emergency transport service.</p>
            <button className="book-btn" onClick={() => navigate("/bookAmbulance")}>
              Book Your First Ambulance
            </button>
          </div>
        ) : (
          bookings.map((booking) => (
            <div key={booking._id} className="booking-card">
              <div className="booking-card-header">
                <h4>Booking #{booking._id.slice(-6)}</h4>
                <span
                  className="booking-status"
                  style={{ backgroundColor: getStatusColor(booking.status) }}
                >
                  {getStatusText(booking.status)}
                </span>
              </div>

              <div className="booking-locations">
                <div>
                  <strong>📍 Pickup Location:</strong>
                  <p>{booking.pickup}</p>
                </div>
                <div>
                  <strong>🏥 Drop-off Location:</strong>
                  <p>{booking.destination}</p>
                </div>
              </div>

              <div className="booking-footer">
                <div>
                  <small>Booked on: {new Date(booking.timestamp).toLocaleString()}</small>
                  {booking.driver && (
                    <div>
                      <strong>Assigned Driver:</strong> {booking.driver.username}
                      {booking.status === "accepted" && (
                        <div style={{ marginTop: "5px", fontSize: "14px", color: "#666" }}>
                          <div><strong>Mobile:</strong> {booking.driver.mobile}</div>
                          <div><strong>Vehicle:</strong> {booking.driver.vehicleNumber}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {booking.status === "pending" && (
                  <button
                    className="cancel-btn"
                    onClick={() => cancelBooking(booking._id)}
                  >
                    Cancel Booking
                  </button>
                )}

                {booking.status === "accepted" && (
                  <button
                    className="track-btn"
                    onClick={() => navigate(`/track/${booking._id}`, { state: { booking } })}
                  >
                    Track Ambulance
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() =>
              setToasts((prev) => prev.filter((toast) => toast.id !== t.id))
            }
          />
        ))}
      </div>
    </div>
  );
}

export default MyBookings;