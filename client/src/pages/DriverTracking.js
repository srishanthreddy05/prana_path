import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { joinBookingRoom, emitDriverLocation, onUserLocation } from "../utils/socket";
import { getAmbulanceIconUrl, getPoliceIconUrl } from "../utils/mapIcons";
import "../styles/DriverDashboard.css";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const DriverTracking = ({ showToast }) => {
  const { bookingId } = useParams();
  const locationState = useLocation();
  const navigate = useNavigate();
  
  const initialBooking = locationState.state?.booking || null;
  
  const [booking, setBooking] = useState(initialBooking);
  const [loading, setLoading] = useState(!initialBooking);
  const [pickupAddress, setPickupAddress] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const pickupMarker = useRef(null);
  const destinationMarker = useRef(null);
  const driverMarker = useRef(null);
  const policeMarkers = useRef([]);
  const driverToPickupRenderer = useRef(null);
  const pickupToDestRenderer = useRef(null);
  const trackingInterval = useRef(null);

  // Fetch booking if not passed via state
  useEffect(() => {
    if (booking || !bookingId) return;

    const fetchBooking = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/bookings/${bookingId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setBooking(data);
        } else {
          showToast("Failed to load booking", "error");
          navigate("/driver/history");
        }
      } catch (err) {
        console.error("Failed to fetch booking:", err);
        showToast("Failed to load booking", "error");
        navigate("/driver/history");
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [booking, bookingId, navigate, showToast]);

  // Get address from coordinates
  const getAddressFromCoords = useCallback(async (lat, lng) => {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        setPickupAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        return;
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.status === "OK" && data.results && data.results[0]) {
        setPickupAddress(data.results[0].formatted_address);
      } else {
        setPickupAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setPickupAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }, []);

  // Get pickup address when booking loads
  useEffect(() => {
    if (booking?.pickupLat && booking?.pickupLng) {
      getAddressFromCoords(booking.pickupLat, booking.pickupLng);
    }
  }, [booking, getAddressFromCoords]);

  // Initialize Google Map when booking exists
  useEffect(() => {
    if (!booking || !window.google || !mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        zoom: 12,
        center: { lat: booking.pickupLat, lng: booking.pickupLng },
        mapTypeId: "roadmap",
      });
    }

    // Add pickup marker
    if (pickupMarker.current) pickupMarker.current.setMap(null);
    pickupMarker.current = new window.google.maps.Marker({
      position: { lat: booking.pickupLat, lng: booking.pickupLng },
      map: mapInstance.current,
      label: "P",
      title: "Pickup Location",
      icon: {
        url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        scaledSize: new window.google.maps.Size(40, 40),
      },
    });

    // Add destination marker
    if (destinationMarker.current) destinationMarker.current.setMap(null);
    destinationMarker.current = new window.google.maps.Marker({
      position: { lat: booking.destLat, lng: booking.destLng },
      map: mapInstance.current,
      label: "D",
      title: "Destination",
      icon: {
        url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        scaledSize: new window.google.maps.Size(40, 40),
      },
    });

    // Fetch and display police locations
    const fetchPoliceLocations = async () => {
      try {
        const res = await fetch(`/api/bookings/${booking._id}/police-locations`, {
          credentials: "include"
        });
        if (res.ok) {
          const locations = await res.json();
          
          // Clear existing police markers
          policeMarkers.current.forEach(marker => marker.setMap(null));
          policeMarkers.current = [];
          
          // Add police markers
          locations.forEach(police => {
            const marker = new window.google.maps.Marker({
              position: { lat: police.lat, lng: police.lng },
              map: mapInstance.current,
              title: `${police.name} - ${police.station}`,
              icon: {
                url: getPoliceIconUrl(),
                scaledSize: new window.google.maps.Size(25, 25),
                anchor: new window.google.maps.Point(12, 12),
              },
              zIndex: 900,
            });
            
            const infoWindow = new window.google.maps.InfoWindow({
              content: `<div style="font-weight:bold;">🚔 ${police.name}</div><div>${police.station}</div>`,
            });
            marker.addListener("click", () => {
              infoWindow.open(mapInstance.current, marker);
            });
            
            policeMarkers.current.push(marker);
          });
        }
      } catch (err) {
        console.error("Error fetching police locations:", err);
      }
    };
    
    fetchPoliceLocations();

    // Initialize direction renderers
    const directionsService = new window.google.maps.DirectionsService();
    
    // Renderer for pickup to destination route (blue)
    if (pickupToDestRenderer.current) pickupToDestRenderer.current.setMap(null);
    pickupToDestRenderer.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.8 },
    });
    pickupToDestRenderer.current.setMap(mapInstance.current);

    // Draw route from pickup to destination
    directionsService.route(
      {
        origin: { lat: booking.pickupLat, lng: booking.pickupLng },
        destination: { lat: booking.destLat, lng: booking.destLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (response, status) => {
        if (status === "OK") {
          pickupToDestRenderer.current.setDirections(response);
        }
      }
    );

    // Renderer for driver to pickup route (orange)
    if (driverToPickupRenderer.current) driverToPickupRenderer.current.setMap(null);
    driverToPickupRenderer.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#FF6B35", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    driverToPickupRenderer.current.setMap(mapInstance.current);

    // Join socket room
    joinBookingRoom(booking._id, "driver");

    // Listen for user location updates
    onUserLocation((userLoc) => {
      if (userLoc && userLoc.lat && userLoc.lng) {
        // Could update user marker here if needed
      }
    });

    // Function to draw route from driver to pickup
    const drawDriverToPickupRoute = (driverLoc) => {
      if (!mapInstance.current) return;
      
      const directionsServiceLocal = new window.google.maps.DirectionsService();
      
      if (driverToPickupRenderer.current) {
        driverToPickupRenderer.current.setMap(null);
      }
      driverToPickupRenderer.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { 
          strokeColor: "#FF6B35", 
          strokeWeight: 6, 
          strokeOpacity: 1.0 
        },
        preserveViewport: true,
      });
      driverToPickupRenderer.current.setMap(mapInstance.current);
      
      directionsServiceLocal.route(
        {
          origin: driverLoc,
          destination: { lat: booking.pickupLat, lng: booking.pickupLng },
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (response, status) => {
          if (status === "OK" && driverToPickupRenderer.current) {
            driverToPickupRenderer.current.setDirections(response);
          }
        }
      );
    };

    const updateDriverMarker = (loc) => {
      if (!mapInstance.current) return;

      if (driverMarker.current) driverMarker.current.setMap(null);

      driverMarker.current = new window.google.maps.Marker({
        position: loc,
        map: mapInstance.current,
        title: "Your Location (Ambulance)",
        icon: {
          url: getAmbulanceIconUrl(),
          scaledSize: new window.google.maps.Size(25, 25),
          anchor: new window.google.maps.Point(12, 12),
        },
      });
    };

    // Start sharing driver location and draw route
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          emitDriverLocation(booking._id, loc.lat, loc.lng);
          updateDriverMarker(loc);
          
          setTimeout(() => {
            drawDriverToPickupRoute(loc);
          }, 500);
          
          // Fit map bounds to show all markers
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(loc);
          bounds.extend({ lat: booking.pickupLat, lng: booking.pickupLng });
          bounds.extend({ lat: booking.destLat, lng: booking.destLng });
          mapInstance.current.fitBounds(bounds);
        },
        (err) => {
          console.error("Geolocation error:", err);
        },
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
      
      // Continue updating location
      trackingInterval.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            emitDriverLocation(booking._id, loc.lat, loc.lng);
            updateDriverMarker(loc);
            drawDriverToPickupRoute(loc);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      }, 3000);
    }

    return () => {
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      policeMarkers.current.forEach(marker => marker.setMap(null));
      policeMarkers.current = [];
    };
  }, [booking]);

  const completeBooking = async () => {
    try {
      const res = await fetch(`/api/bookings/${booking._id}/complete`, {
        method: "PUT",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to complete booking");
      
      showToast("✅ Booking completed!", "success");
      navigate("/driver/history");
    } catch (err) {
      console.error(err);
      showToast("Failed to complete booking", "error");
    }
  };

  // Cancel booking by driver
  const cancelBooking = async () => {
    if (!booking?._id) return;
    
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${booking._id}/driver-cancel`, {
        method: "PUT",
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to cancel booking");
      }
      
      showToast("⚠️ Booking cancelled. User will be notified to search for another driver.", "info");
      
      // Clear tracking interval
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      
      navigate("/driver/dashboard");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to cancel booking", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending": return "#ffc107";
      case "accepted": return "#17a2b8";
      case "completed": return "#28a745";
      case "cancelled": return "#dc3545";
      default: return "#6c757d";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "pending": return "Pending";
      case "accepted": return "In Progress";
      case "completed": return "Completed";
      case "cancelled": return "Cancelled";
      default: return "Unknown";
    }
  };

  if (loading) {
    return (
      <div className="driver-dashboard">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="driver-dashboard">
        <div className="no-booking-message">
          <h3>Booking not found</h3>
          <button onClick={() => navigate("/driver/history")} className="btn-back">
            ← Back to History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-dashboard">
      <div className="tracking-header">
        <button onClick={() => navigate("/driver/history")} className="btn-back">
          ← Back to History
        </button>
        <h2>Tracking Booking #{booking._id.slice(-6).toUpperCase()}</h2>
        <span 
          className="status-badge"
          style={{ backgroundColor: getStatusColor(booking.status) }}
        >
          {getStatusText(booking.status)}
        </span>
      </div>

      <div className="active-booking-card">
        <div className="active-booking-content">
          {/* Left Side: Map */}
          <div className="map-section">
            <div className="map-header">
              <h2>Live Location Tracking</h2>
              <div className="map-legend-inline">
                <span className="legend-item"><span className="dot red"></span> Pickup</span>
                <span className="legend-item"><span className="dot green"></span> Hospital</span>
                <span className="legend-item"><span className="route-line orange"></span> Driver → Pickup</span>
                <span className="legend-item"><span className="route-line blue"></span> Pickup → Hospital</span>
              </div>
            </div>
            <div ref={mapRef} className="map-container"></div>
          </div>

          {/* Right Side: Details */}
          <div className="info-section">
            {/* Patient Info */}
            <div className="info-card">
              <div className="card-header">
                <h3>Patient Information</h3>
              </div>
              <div className="card-body">
                <div className="info-row">
                  <span className="label">Name:</span>
                  <span className="value">{booking.user?.username || "N/A"}</span>
                </div>
                <div className="info-row">
                  <span className="label">Mobile:</span>
                  <span className="value">{booking.user?.mobile || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* Trip Details */}
            <div className="info-card">
              <div className="card-header">
                <h3>Trip Details</h3>
              </div>
              <div className="card-body">
                <div className="info-row">
                  <span className="label">Pickup:</span>
                  <span className="value">{pickupAddress || "Loading..."}</span>
                </div>
                <div className="info-row">
                  <span className="label">Destination:</span>
                  <span className="value">{booking.destination}</span>
                </div>
                <div className="info-row">
                  <span className="label">Booked At:</span>
                  <span className="value">{new Date(booking.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            {booking.status === "accepted" && (
              <div className="action-buttons">
                <button onClick={completeBooking} className="btn-complete">
                  ✓ Complete Booking
                </button>
                <button 
                  onClick={cancelBooking} 
                  className="btn-cancel-booking"
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling..." : "✕ Cancel Booking"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverTracking;
