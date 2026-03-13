import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";
import "../styles/PoliceDashboard.css";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const PoliceDashboard = ({ showToast }) => {
  const [bookings, setBookings] = useState([]);
  const [addresses, setAddresses] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const navigate = useNavigate();

  // Fetch active bookings from backend
  const fetchBookings = useCallback(async () => {
    try {
      const res = await authFetch("/police/bookings");
      if (!res.ok) throw new Error("Failed to fetch bookings");
      const data = await res.json();
      
      // Only show accepted (active) bookings
      const activeBookings = data.filter(b => b.status === "accepted");
      setBookings(activeBookings);

      // Convert coordinates to addresses for all bookings
      activeBookings.forEach(booking => {
        if (booking.pickupLat && booking.pickupLng) {
          getAddressFromCoords(booking._id, booking.pickupLat, booking.pickupLng);
        }
      });
    } catch (err) {
      console.error(err);
      showToast && showToast("Failed to fetch bookings", "error");
    }
  }, [showToast]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    const initialFetch = async () => {
      setLoading(true);
      await fetchBookings();
      setLoading(false);
    };
    initialFetch();

    // Refresh bookings every 10 seconds
    const interval = setInterval(fetchBookings, 10000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // Socket listener for real-time booking completion updates
  useEffect(() => {
    const socket = getSocket();

    const handleBookingCompleted = (data) => {
      console.log("Booking completed event received:", data);
      // Remove the completed booking from the list immediately
      setBookings(prev => prev.filter(b => b._id !== data.bookingId));
    };

    socket.on("booking:completed", handleBookingCompleted);

    return () => {
      socket.off("booking:completed", handleBookingCompleted);
    };
  }, []);

  // Reverse geocoding
  const getAddressFromCoords = async (bookingId, lat, lng) => {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        setAddresses(prev => ({ ...prev, [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }));
        return;
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      const address = data.status === "OK" && data.results?.[0]
        ? data.results[0].formatted_address
        : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      setAddresses(prev => ({ ...prev, [bookingId]: address }));
    } catch (err) {
      console.error("Geocoding error:", err);
      setAddresses(prev => ({ ...prev, [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }));
    }
  };

  // Navigate to booking detail page
  const handleViewBooking = (bookingId) => {
    navigate(`/police/booking/${bookingId}`);
  };

  // Loading timeout fallback
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setLoadingError(true);
      }
    }, 10000); // 10 seconds
    return () => clearTimeout(timeout);
  }, [loading]);

  if (loading) {
    return (
      <div className="police-dashboard">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading active emergencies...</p>
          {loadingError && (
            <div style={{color: 'red', marginTop: 16}}>
              Failed to load emergencies. Please check your connection or try again later.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="police-dashboard">
      {/* Header */}
      <div className="police-header">
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-number">{bookings.length}</span>
            <span className="stat-label">Active Emergencies</span>
          </div>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="no-bookings-container">
          <div className="no-bookings-icon">✓</div>
          <h2>No Active Emergencies</h2>
          <p>All ambulance services are currently running smoothly. No ongoing emergencies in your area.</p>
        </div>
      ) : (
        <div className="police-bookings-list">
          {/* Table Header */}
          <div className="bookings-table-header">
            <div className="col-id">Booking ID</div>
            <div className="col-patient">Patient</div>
            <div className="col-driver">Driver</div>
            <div className="col-vehicle">Vehicle No.</div>
            <div className="col-location">Pickup Location</div>
            <div className="col-time">Time</div>
            <div className="col-status">Status</div>
            <div className="col-action">Action</div>
          </div>

          {/* Booking Rows */}
          {bookings.map((booking) => (
            <div key={booking._id} className="booking-row" onClick={() => handleViewBooking(booking._id)}>
              <div className="col-id">
                <span className="booking-id">#{booking._id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="col-patient">
                <div className="patient-info">
                  <span className="patient-name">{booking.user?.username || "Unknown"}</span>
                  <a 
                    href={`tel:${booking.user?.mobile}`} 
                    className="patient-phone"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📞 {booking.user?.mobile || "N/A"}
                  </a>
                </div>
              </div>
              <div className="col-driver">
                <div className="driver-info">
                  <span className="driver-name">{booking.driver?.username || "Not Assigned"}</span>
                  <a 
                    href={`tel:${booking.driver?.mobile}`} 
                    className="driver-phone"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📞 {booking.driver?.mobile || "N/A"}
                  </a>
                </div>
              </div>
              <div className="col-vehicle">
                <span className="vehicle-number">{booking.driver?.vehicleNumber || "N/A"}</span>
              </div>
              <div className="col-location">
                <span className="location-text">{addresses[booking._id] || "Loading..."}</span>
              </div>
              <div className="col-time">
                <span className="time-text">{new Date(booking.timestamp).toLocaleString()}</span>
              </div>
              <div className="col-status">
                <span className="status-badge status-accepted">
                  🚑 In Progress
                </span>
              </div>
              <div className="col-action">
                <button 
                  className="view-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewBooking(booking._id);
                  }}
                >
                  View Details →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PoliceDashboard;