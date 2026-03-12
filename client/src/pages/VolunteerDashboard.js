import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";
import "../styles/VolunteerDashboard.css";

const VolunteerDashboard = ({ showToast }) => {
  const [isActive, setIsActive] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [activeBooking, setActiveBooking] = useState(null);
  const [dismissedBookings, setDismissedBookings] = useState(new Set());
  const [volunteerLocation, setVolunteerLocation] = useState(null);
  const [addresses, setAddresses] = useState({});
  const [profileLoaded, setProfileLoaded] = useState(false);

  const locationWatchId = useRef(null);
  const pollIntervalRef = useRef(null);
  const navigate = useNavigate();

  // Validate volunteer role on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authFetch("/users/profile");
        if (res.ok) {
          const data = await res.json();
          if (data.volunteerRole !== "ambulance_volunteer") {
            showToast("This page is only for ambulance volunteers. Join from the home page.", "error");
            navigate("/");
            return;
          }
          setIsActive(data.volunteerActive || false);
          setProfileLoaded(true);
        }
      } catch (err) {
        console.error("Failed to fetch volunteer profile:", err);
      }
    };
    fetchProfile();
  }, [navigate, showToast]);

  // Start/stop location tracking when isActive changes
  useEffect(() => {
    if (!isActive || !profileLoaded) {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      showToast("Geolocation is not supported in this browser", "error");
      return;
    }

    const handlePosition = async (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setVolunteerLocation(coords);
      try {
        await authFetch("/volunteers/location", {
          method: "PUT",
          body: JSON.stringify(coords),
        });
      } catch (err) {
        console.error("Volunteer location sync failed:", err);
      }
    };

    // Immediate position then continuous watch
    navigator.geolocation.getCurrentPosition(handlePosition, console.error, {
      enableHighAccuracy: true,
      timeout: 10000,
    });

    locationWatchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => console.error("Geolocation watch error:", err),
      { enableHighAccuracy: true, maximumAge: 15000 }
    );

    return () => {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
    };
  }, [isActive, profileLoaded, showToast]);

  // Poll pending bookings when active
  const fetchPendingBookings = useCallback(async () => {
    try {
      const res = await authFetch("/volunteers/bookings");
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter((b) => !dismissedBookings.has(b._id));
        setPendingBookings(filtered);
        filtered.forEach((b) => {
          if (b.pickupLat && b.pickupLng) {
            geocodeBooking(b._id, b.pickupLat, b.pickupLng);
          }
        });
      }
    } catch (err) {
      console.error("Failed to fetch volunteer bookings:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissedBookings]);

  useEffect(() => {
    if (!isActive || !profileLoaded || activeBooking) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (!isActive) setPendingBookings([]);
      return;
    }

    fetchPendingBookings();
    pollIntervalRef.current = setInterval(fetchPendingBookings, 10000);
    return () => {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  }, [isActive, profileLoaded, activeBooking, fetchPendingBookings]);

  useEffect(() => {
    if (activeBooking?.pickupLat && activeBooking?.pickupLng) {
      geocodeBooking(activeBooking._id, activeBooking.pickupLat, activeBooking.pickupLng);
    }
  }, [activeBooking]);

  // Socket — new booking notifications + cancellation
  useEffect(() => {
    const socket = getSocket();
    const userId = localStorage.getItem("userId");
    if (userId) socket.emit("user:join", userId);

    socket.on("volunteer:booking:new", (booking) => {
      if (!isActive || activeBooking) return;
      setPendingBookings((prev) => {
        if (prev.some((b) => b._id === booking._id)) return prev;
        return [booking, ...prev];
      });
      showToast("🚑 New nearby emergency booking request!", "info");
    });

    socket.on("bookingCancelled", (payload) => {
      if (
        activeBooking &&
        (payload?.bookingId === activeBooking._id || payload?._id === activeBooking._id)
      ) {
        showToast("⚠️ The booking was cancelled by the patient.", "error");
        setActiveBooking(null);
      }
    });

    return () => {
      socket.off("volunteer:booking:new");
      socket.off("bookingCancelled");
    };
  }, [isActive, activeBooking, showToast]);

  const geocodeBooking = async (bookingId, lat, lng) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyD1ZnITeqwr7gt6pMeGfnlR-EBL1kYPbXA`
      );
      const data = await res.json();
      const addr =
        data.status === "OK" && data.results?.[0]
          ? data.results[0].formatted_address
          : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setAddresses((prev) => ({ ...prev, [bookingId]: addr }));
    } catch {
      setAddresses((prev) => ({ ...prev, [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }));
    }
  };

  const handleActivationToggle = async () => {
    const newState = !isActive;

    if (newState && !navigator.geolocation) {
      showToast("Location access is required to activate volunteer mode", "error");
      return;
    }

    try {
      const endpoint = newState ? "/volunteers/join" : "/volunteers/leave";
      const requestBody = newState ? { volunteerType: "ambulance_volunteer" } : {};
      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.message || "Failed to update volunteer status", "error");
        return;
      }

      setIsActive(newState);
      showToast(
        newState
          ? "🟢 Volunteer mode active — watching for nearby requests"
          : "⚪ Volunteer mode paused",
        newState ? "success" : "info"
      );
    } catch (err) {
      console.error("Failed to update volunteer activation:", err);
      showToast("Failed to update volunteer status", "error");
    }
  };

  const handleAcceptBooking = async (id) => {
    try {
      const res = await authFetch(`/bookings/${id}/accept`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.message || "Failed to accept booking", "error");
        return;
      }
      const updated = await res.json();
      showToast("✅ Booking accepted! You are now the emergency responder.", "success");
      setPendingBookings((prev) => prev.filter((b) => b._id !== id));
      setActiveBooking(updated);
    } catch (err) {
      console.error(err);
      showToast("Failed to accept booking", "error");
    }
  };

  const handleDismissBooking = (id) => {
    setDismissedBookings((prev) => new Set([...prev, id]));
    setPendingBookings((prev) => prev.filter((b) => b._id !== id));
  };

  const handleCompleteBooking = async () => {
    if (!activeBooking) return;
    try {
      const res = await authFetch(`/bookings/${activeBooking._id}/complete`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.message || "Failed to complete booking", "error");
        return;
      }
      showToast("✅ Booking completed! Thank you for volunteering.", "success");
      setActiveBooking(null);
    } catch (err) {
      console.error(err);
      showToast("Failed to complete booking", "error");
    }
  };

  if (!profileLoaded) {
    return (
      <div className="volunteer-dashboard">
        <div className="vol-loading">Loading volunteer profile...</div>
      </div>
    );
  }

  return (
    <div className="volunteer-dashboard">
      <h2 className="volunteer-title">
        <span className="vol-title-icon">🚑</span> Ambulance Volunteer Dashboard
      </h2>

      {/* Activation Toggle */}
      <div className="vol-toggle-container">
        <div className="vol-toggle-left">
          <label className="vol-toggle-label">
            <span>{isActive ? "Accepting requests near you" : "Activate to start helping"}</span>
            <div
              className={`vol-toggle-switch ${isActive ? "active" : ""}`}
              onClick={handleActivationToggle}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleActivationToggle()}
            />
          </label>
          <span className={`vol-status-badge ${isActive ? "active" : "inactive"}`}>
            {isActive ? "🟢 Active" : "⚪ Inactive"}
          </span>
        </div>
        {volunteerLocation && isActive && (
          <span className="vol-location-badge">
            📍 {volunteerLocation.lat.toFixed(4)}, {volunteerLocation.lng.toFixed(4)}
          </span>
        )}
      </div>

      {/* Info Banner */}
      <div className="vol-info-banner">
        <i className="fa-solid fa-circle-info"></i>
        <span>
          As an ambulance volunteer, you respond to emergency bookings within{" "}
          <strong>15 km</strong> when no professional driver is immediately available.
          Your quick action can save a life.
        </span>
      </div>

      {/* Active Booking */}
      {activeBooking && (
        <div className="vol-active-booking">
          <div className="vol-active-header">
            <h3>🚨 You Are Responding — Active Booking</h3>
          </div>
          <div className="vol-active-details">
            <div className="vol-detail-row">
              <span className="vol-label">Patient</span>
              <span className="vol-value">{activeBooking.user?.username || "Unknown"}</span>
            </div>
            <div className="vol-detail-row">
              <span className="vol-label">Contact</span>
              <a href={`tel:${activeBooking.user?.mobile}`} className="vol-phone">
                📞 {activeBooking.user?.mobile || "N/A"}
              </a>
            </div>
            <div className="vol-detail-row">
              <span className="vol-label">Pickup</span>
              <span className="vol-value">
                {addresses[activeBooking._id] ||
                  `${activeBooking.pickupLat?.toFixed(4)}, ${activeBooking.pickupLng?.toFixed(4)}`}
              </span>
            </div>
            <div className="vol-detail-row">
              <span className="vol-label">Destination</span>
              <span className="vol-value">{activeBooking.destination}</span>
            </div>
            <div className="vol-detail-row">
              <span className="vol-label">Emergency Type</span>
              <span className="vol-value">{activeBooking.emergencyType || "N/A"}</span>
            </div>
            {activeBooking.situation && (
              <div className="vol-detail-row">
                <span className="vol-label">Situation</span>
                <span className="vol-value">{activeBooking.situation}</span>
              </div>
            )}
          </div>
          <div className="vol-active-actions">
            <button onClick={handleCompleteBooking} className="vol-btn-complete">
              ✓ Mark as Completed
            </button>
          </div>
        </div>
      )}

      {/* Pending Requests when active */}
      {!activeBooking && isActive && (
        <div className="vol-section">
          <h3 className="vol-section-title">
            Nearby Emergency Requests
            <span className="vol-count-badge">{pendingBookings.length}</span>
          </h3>
          {pendingBookings.length === 0 ? (
            <div className="vol-empty">
              <div className="vol-empty-icon">🔍</div>
              <p className="vol-empty-text">No pending requests within 15 km right now.</p>
              <p className="vol-empty-sub">Stay active — requests will appear here automatically.</p>
            </div>
          ) : (
            <div className="vol-cards-list">
              {pendingBookings.map((b) => (
                <div key={b._id} className="vol-card">
                  <div className="vol-card-tags">
                    <span className="vol-tag emergency">{b.emergencyType || "Emergency"}</span>
                    {b.situation && <span className="vol-tag situation">{b.situation}</span>}
                  </div>
                  <div className="vol-card-info">
                    <p>
                      <strong>Patient:</strong> {b.user?.username} ({b.user?.mobile})
                    </p>
                    <p>
                      <strong>Pickup:</strong> {addresses[b._id] || "Loading address..."}
                    </p>
                    <p>
                      <strong>Destination:</strong> {b.destination}
                    </p>
                  </div>
                  <div className="vol-card-actions">
                    <button
                      onClick={() => handleAcceptBooking(b._id)}
                      className="vol-btn-accept"
                    >
                      🚑 Accept & Respond
                    </button>
                    <button
                      onClick={() => handleDismissBooking(b._id)}
                      className="vol-btn-dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inactive state message */}
      {!isActive && !activeBooking && (
        <div className="vol-inactive-msg">
          <div className="vol-inactive-icon">🤝</div>
          <p className="vol-inactive-text">
            Activate volunteer mode to start receiving emergency requests.
          </p>
          <p className="vol-inactive-sub">
            Your location will be tracked to match you with the nearest requests within 15 km.
          </p>
        </div>
      )}
    </div>
  );
};

export default VolunteerDashboard;
