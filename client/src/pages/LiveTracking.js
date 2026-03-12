import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MapManager } from "../utils/mapUtils";
import { calculateETA } from "../services/locationService";
import { getBookingById, cancelBooking } from "../services/bookingService";
import { joinBookingRoom, emitUserLocation, getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";
import "../styles/liveTracking.css";

const getStatusCopy = (status) => {
  switch (status) {
    case "accepted":
      return "Driver is on the way";
    case "completed":
      return "Ride completed";
    case "pending":
      return "Waiting for driver";
    default:
      return "";
  }
};

function LiveTracking({ showToast }) {
  const { bookingId } = useParams();
  const navigationState = useLocation();
  const navigate = useNavigate();

  const initialBooking = navigationState.state?.booking || null;
  const initialDriver = navigationState.state?.driver || navigationState.state?.booking?.driver || null;

  const [booking, setBooking] = useState(initialBooking);
  const [driver, setDriver] = useState(initialDriver);
  const [status, setStatus] = useState(initialBooking?.status || "accepted");
  const [eta, setEta] = useState(null);
  const [loading, setLoading] = useState(!initialBooking);
  const [isCancelling, setIsCancelling] = useState(false);

  const mapRef = useRef(null);
  const mapManagerRef = useRef(null);
  const locationIntervalRef = useRef(null);

  // Initialize the map once
  useEffect(() => {
    if (mapManagerRef.current || !mapRef.current || !window.google) return;
    mapManagerRef.current = new MapManager(mapRef, showToast);
    mapManagerRef.current.initializeMap(() => {});
  }, [showToast]);

  // Fetch booking if we landed directly on this URL
  useEffect(() => {
    if (booking || !bookingId) return;

    const loadBooking = async () => {
      try {
        setLoading(true);
        const data = await getBookingById(bookingId);
        setBooking(data);
        setDriver(data.driver);
        setStatus(data.status);
      } catch (err) {
        showToast(err.message || "Could not load booking", "error");
        navigate("/MyBookings");
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [booking, bookingId, navigate, showToast]);

  // Drop pickup/destination markers when booking info is present
  useEffect(() => {
    if (!booking || !mapManagerRef.current || !mapManagerRef.current.mapInstance || !window.google) return;

    if (booking.pickupLat && booking.pickupLng) {
      mapManagerRef.current.addPickupMarker({ lat: booking.pickupLat, lng: booking.pickupLng });
    }

    if (booking.destLat && booking.destLng) {
      mapManagerRef.current.addDestinationMarker({ lat: booking.destLat, lng: booking.destLng });
    }
  }, [booking]);

  const stopSharingLocation = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }, []);

  // Handle cancel booking
  const handleCancelBooking = async () => {
    if (!bookingId) return;

    setIsCancelling(true);
    try {
      await cancelBooking(bookingId);
      showToast("✅ Booking cancelled successfully", "success");
      stopSharingLocation();
      navigate("/");
    } catch (err) {
      console.error("Cancel booking error:", err);
      showToast("❌ " + err.message, "error");
      setIsCancelling(false);
    }
  };

  const shareUserLocation = useCallback(() => {
    if (!bookingId) return;

    const shareOnce = () => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          emitUserLocation(String(bookingId), loc.lat, loc.lng);
        },
        () => {
          // ignore errors silently
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    };

    shareOnce();
    locationIntervalRef.current = setInterval(shareOnce, 5000);
  }, [bookingId]);

  // Start sharing the user's location as soon as we have an accepted booking
  useEffect(() => {
    if (status === "completed") {
      stopSharingLocation();
      return;
    }

    shareUserLocation();
    return stopSharingLocation;
  }, [shareUserLocation, stopSharingLocation, status]);

  // Polling fallback to detect if driver cancelled (status changed to pending)
  useEffect(() => {
    if (!bookingId || status !== "accepted") return;

    const pollBookingStatus = async () => {
      try {
        const res = await authFetch(`/bookings/${bookingId}`);
        if (res.ok) {
          const data = await res.json();
          // If booking is back to pending, driver cancelled
          if (data.status === "pending") {
            console.log("📡 Polling detected booking status changed to pending - driver cancelled");
            showToast("⚠️ Driver cancelled. Searching for another ambulance...", "warning");
            stopSharingLocation();
            navigate(`/track/${bookingId}`, { 
              state: { 
                driverCancelled: true, 
                bookingId: bookingId 
              } 
            });
          }
        }
      } catch (err) {
        console.error("Error polling booking status:", err);
      }
    };

    const pollInterval = setInterval(pollBookingStatus, 5000);
    return () => clearInterval(pollInterval);
  }, [bookingId, status, navigate, showToast, stopSharingLocation]);

  // Wire up socket listeners for driver location and completion
  useEffect(() => {
    if (!bookingId) return;

    const socket = getSocket();
    joinBookingRoom(bookingId, "user");
    console.log("🟢 User joined booking room:", bookingId);

    const handleDriverLocation = async (loc) => {
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;

      if (mapManagerRef.current) {
        mapManagerRef.current.addDriverMarker({ lat: loc.lat, lng: loc.lng });
      }

      const pickupPos = booking?.pickupLat
        ? { lat: booking.pickupLat, lng: booking.pickupLng }
        : mapManagerRef.current?.getPickupPosition();

      if (pickupPos) {
        const etaValue = await calculateETA({ lat: loc.lat, lng: loc.lng }, pickupPos);
        if (etaValue) setEta(etaValue);
      }
    };

    const handleCompleted = (payload) => {
      const payloadId = payload?.bookingId || payload?._id;
      if (payloadId && String(payloadId) !== String(bookingId)) return;

      setStatus("completed");
      stopSharingLocation();
      showToast("Ride completed. Hope you are safe!", "success");
    };

    const handleCancelled = (payload) => {
      const payloadId = payload?.bookingId || payload?._id;
      if (payloadId && String(payloadId) !== String(bookingId)) return;

      setStatus("cancelled");
      stopSharingLocation();
    };

    // Handle driver cancellation - redirect to book ambulance page to re-search
    const handleDriverCancelled = (payload) => {
      console.log("📡 Received booking:driver-cancelled event:", payload);
      const payloadId = payload?.bookingId || payload?._id;
      if (payloadId && String(payloadId) !== String(bookingId)) {
        console.log("📡 Ignoring event - bookingId mismatch");
        return;
      }

      console.log("📡 Processing driver cancellation, redirecting to book-ambulance");
      showToast("⚠️ Driver cancelled. Searching for another ambulance...", "warning");
      stopSharingLocation();
      // Pass booking info to trigger auto-search
      navigate("/bookAmbulance", { 
        state: { 
          driverCancelled: true, 
          bookingId: bookingId 
        } 
      });
    };

    socket.on("driver:location", handleDriverLocation);
    socket.on("booking:completed", handleCompleted);
    socket.on("bookingCancelled", handleCancelled);
    socket.on("booking:driver-cancelled", handleDriverCancelled);

    return () => {
      socket.off("driver:location", handleDriverLocation);
      socket.off("booking:completed", handleCompleted);
      socket.off("bookingCancelled", handleCancelled);
      socket.off("booking:driver-cancelled", handleDriverCancelled);
    };
  }, [booking?.pickupLat, booking?.pickupLng, bookingId, navigate, showToast, stopSharingLocation]);

  if (!bookingId) {
    return (
      <div className="live-tracking-page">
        <div className="tracking-empty">No booking selected.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="live-tracking-page">
        <div className="tracking-empty">Loading booking...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="live-tracking-page">
        <div className="tracking-empty">Booking not found.</div>
      </div>
    );
  }

  return (
    <div className="live-tracking-page">
      <div className="tracking-header">
        <div>
          <p className="tracking-eyebrow">Booking #{booking._id.slice(-6)}</p>
          <h2>Live Ambulance Tracking</h2>
          <p className="tracking-sub">{getStatusCopy(status)}</p>
        </div>
        <div className="tracking-badges">
          <span className={`status-chip ${status}`}>{status.toUpperCase()}</span>
        </div>
      </div>

      <div className="tracking-body">
        <div className="map-section">
          <div className="map-header">
            <h2>Live Location Tracking</h2>
            <div className="map-legend-inline">
              <span className="legend-item"><span className="dot red"></span> Pickup</span>
              <span className="legend-item"><span className="dot green"></span> Destination</span>
              <span className="legend-item"><span className="route-line orange"></span> Driver → Pickup</span>
              <span className="legend-item"><span className="route-line blue"></span> Pickup → Hospital</span>
            </div>
          </div>
          <div className="tracking-map" ref={mapRef} />
        </div>

        <div className="tracking-side">
          <section className="info-card">
            <div className="info-title">Driver Information</div>
            {driver ? (
              <div className="driver-details">
                <div className="detail-row">
                  <span className="detail-label">Name:</span>
                  <span className="detail-value">{driver.username}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Mobile:</span>
                  <span className="detail-value">{driver.mobile}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vehicle:</span>
                  <span className="detail-value">{driver.vehicleNumber}</span>
                </div>
              </div>
            ) : (
              <p className="muted">Driver details will appear once assigned.</p>
            )}
            {eta && <div className="pill">Estimated Arrival Time: {eta} minutes</div>}
          </section>

          <section className="info-card grid">
            <div>
              <div className="info-title">Pickup</div>
              <p className="muted">{booking.pickup}</p>
            </div>
            <div>
              <div className="info-title">Destination</div>
              <p className="muted">{booking.destination}</p>
            </div>
          </section>

          <section className="info-card actions">
            {(status !== "completed" && status !== "cancelled") && (
              <button 
                className="cancel-btn" 
                onClick={handleCancelBooking}
                disabled={isCancelling}
              >
                {isCancelling ? "Cancelling..." : "Cancel Booking"}
              </button>
            )}
            {status === "cancelled" && (
              <button className="outline" onClick={() => navigate("/MyBookings")}>Back to My Bookings</button>
            )}
            <button className="primary" onClick={() => navigate("/bookAmbulance")}>New Booking</button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default LiveTracking;
