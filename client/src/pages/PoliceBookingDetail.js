import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { joinBookingRoom, onDriverLocation, getSocket } from "../utils/socket";
import { getAmbulanceIconUrl, getPoliceIconUrl } from "../utils/mapIcons";
import { authFetch } from "../utils/api";
import "../styles/PoliceBookingDetail.css";

const PoliceBookingDetail = ({ showToast }) => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [destAddress, setDestAddress] = useState("");
  const [policeLocation, setPoliceLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const pickupMarker = useRef(null);
  const destinationMarker = useRef(null);
  const driverMarker = useRef(null);
  const policeMarker = useRef(null);
  const driverToPickupRenderer = useRef(null);
  const pickupToDestRenderer = useRef(null);

  // Fetch police user's profile to get their current location
  useEffect(() => {
    const fetchPoliceProfile = async () => {
      try {
        console.log("🚔 Fetching police profile for current location...");
        const res = await authFetch("/users/profile");
        if (res.ok) {
          const data = await res.json();
          console.log("🚔 Police profile data:", data);
          console.log("🚔 Current location in profile:", data.currentLocation);
          if (data.currentLocation && data.currentLocation.lat && data.currentLocation.lng) {
            setPoliceLocation({
              lat: data.currentLocation.lat,
              lng: data.currentLocation.lng,
              name: data.displayName || "Your Location",
              station: data.station || "Police Station"
            });
            console.log("🚔 Police location set successfully");
          } else {
            console.log("🚔 No valid currentLocation in police profile");
          }
        } else {
          console.log("🚔 Failed to fetch police profile, status:", res.status);
        }
      } catch (err) {
        console.error("Failed to fetch police profile:", err);
      }
    };
    fetchPoliceProfile();
  }, []);

  // Fetch booking details
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/police/booking/${bookingId}`, {
          credentials: "include",
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            setError("Booking not found or has been completed");
          } else {
            throw new Error("Failed to fetch booking");
          }
          return;
        }
        
        const data = await res.json();
        setBooking(data);
        
        // Get addresses
        if (data.pickupLat && data.pickupLng) {
          getAddressFromCoords(data.pickupLat, data.pickupLng, 'pickup');
        }
        if (data.destLat && data.destLng) {
          getAddressFromCoords(data.destLat, data.destLng, 'dest');
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load booking details");
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  // Reverse geocoding
  const getAddressFromCoords = async (lat, lng, type) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyD1ZnITeqwr7gt6pMeGfnlR-EBL1kYPbXA`
      );
      const data = await response.json();
      
      const address = data.status === "OK" && data.results?.[0]
        ? data.results[0].formatted_address
        : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      if (type === 'pickup') {
        setPickupAddress(address);
      } else {
        setDestAddress(address);
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (type === 'pickup') {
        setPickupAddress(fallback);
      } else {
        setDestAddress(fallback);
      }
    }
  };

  // Initialize Google Map
  useEffect(() => {
    if (!booking || !window.google || !mapRef.current) return;

    // Initialize map
    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      zoom: 13,
      center: { lat: booking.pickupLat, lng: booking.pickupLng },
      mapTypeId: "roadmap",
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Add pickup marker (red)
    pickupMarker.current = new window.google.maps.Marker({
      position: { lat: booking.pickupLat, lng: booking.pickupLng },
      map: mapInstance.current,
      label: { text: "P", color: "white", fontWeight: "bold" },
      title: "Pickup Location",
      icon: {
        url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        scaledSize: new window.google.maps.Size(45, 45),
      },
    });

    // Add destination marker (green)
    destinationMarker.current = new window.google.maps.Marker({
      position: { lat: booking.destLat, lng: booking.destLng },
      map: mapInstance.current,
      label: { text: "D", color: "white", fontWeight: "bold" },
      title: "Destination",
      icon: {
        url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        scaledSize: new window.google.maps.Size(45, 45),
      },
    });

    // Initialize direction renderers
    const directionsService = new window.google.maps.DirectionsService();

    // Renderer for pickup to destination route (blue)
    pickupToDestRenderer.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { 
        strokeColor: "#4285F4", 
        strokeWeight: 5, 
        strokeOpacity: 0.8 
      },
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
    driverToPickupRenderer.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { 
        strokeColor: "#FF6B35", 
        strokeWeight: 5, 
        strokeOpacity: 0.9 
      },
    });
    driverToPickupRenderer.current.setMap(mapInstance.current);

    // Fit bounds to show all markers
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: booking.pickupLat, lng: booking.pickupLng });
    bounds.extend({ lat: booking.destLat, lng: booking.destLng });
    mapInstance.current.fitBounds(bounds);
    
    // Signal that map is ready
    setMapReady(true);

    return () => {
      // Cleanup
      if (pickupMarker.current) pickupMarker.current.setMap(null);
      if (destinationMarker.current) destinationMarker.current.setMap(null);
      if (driverMarker.current) driverMarker.current.setMap(null);
      if (policeMarker.current) policeMarker.current.setMap(null);
      setMapReady(false);
    };
  }, [booking]);

  // Add police location marker when policeLocation is available and map is ready
  useEffect(() => {
    console.log("🚔 Police marker effect triggered");
    console.log("🚔 policeLocation:", policeLocation);
    console.log("🚔 mapReady:", mapReady);
    console.log("🚔 mapInstance.current:", mapInstance.current);
    console.log("🚔 window.google:", !!window.google);
    
    if (!policeLocation || !mapReady || !mapInstance.current || !window.google) {
      console.log("🚔 Skipping - missing dependencies");
      return;
    }

    console.log("🚔 Adding police marker at:", policeLocation.lat, policeLocation.lng);

    // Remove existing police marker if any
    if (policeMarker.current) policeMarker.current.setMap(null);

    // Add police marker (purple)
    policeMarker.current = new window.google.maps.Marker({
      position: { lat: policeLocation.lat, lng: policeLocation.lng },
      map: mapInstance.current,
      title: `${policeLocation.name} - ${policeLocation.station}`,
      icon: {
        url: getPoliceIconUrl(),
        scaledSize: new window.google.maps.Size(25, 25),
        anchor: new window.google.maps.Point(12, 12),
      },
      zIndex: 900,
    });
    
    console.log("🚔 Police marker created successfully");

    // Add info window for police marker
    const infoWindow = new window.google.maps.InfoWindow({
      content: `<div style="font-weight:bold;">🚔 ${policeLocation.name}</div><div>${policeLocation.station}</div><div style="color:#666;font-size:12px;">Your Location</div>`,
    });
    policeMarker.current.addListener("click", () => {
      infoWindow.open(mapInstance.current, policeMarker.current);
    });

    // Extend bounds to include police location
    if (booking) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: booking.pickupLat, lng: booking.pickupLng });
      bounds.extend({ lat: booking.destLat, lng: booking.destLng });
      bounds.extend({ lat: policeLocation.lat, lng: policeLocation.lng });
      mapInstance.current.fitBounds(bounds);
    }
  }, [policeLocation, booking, mapReady]);

  // Socket connection for real-time driver tracking
  useEffect(() => {
    if (!booking?._id) return;

    const socket = getSocket();
    joinBookingRoom(booking._id, "police");

    const handleDriverLocation = (loc) => {
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;
      
      setDriverLocation({ lat: loc.lat, lng: loc.lng });
      
      // Update driver marker on map
      if (mapInstance.current && window.google) {
        if (driverMarker.current) {
          driverMarker.current.setPosition({ lat: loc.lat, lng: loc.lng });
        } else {
          driverMarker.current = new window.google.maps.Marker({
            position: { lat: loc.lat, lng: loc.lng },
            map: mapInstance.current,
            title: "Ambulance",
            icon: {
              url: getAmbulanceIconUrl(),
              scaledSize: new window.google.maps.Size(25, 25),
              anchor: new window.google.maps.Point(12, 12),
            },
            zIndex: 1000,
          });
        }

        // Draw route from driver to pickup
        if (driverToPickupRenderer.current && booking) {
          const directionsService = new window.google.maps.DirectionsService();
          directionsService.route(
            {
              origin: { lat: loc.lat, lng: loc.lng },
              destination: { lat: booking.pickupLat, lng: booking.pickupLng },
              travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (response, status) => {
              if (status === "OK") {
                driverToPickupRenderer.current.setDirections(response);
              }
            }
          );
        }

        // Update bounds to include driver
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend({ lat: loc.lat, lng: loc.lng });
        bounds.extend({ lat: booking.pickupLat, lng: booking.pickupLng });
        bounds.extend({ lat: booking.destLat, lng: booking.destLng });
        mapInstance.current.fitBounds(bounds);
      }
    };

    // Listen for booking status updates
    const handleBookingCompleted = (data) => {
      if (data.bookingId === booking._id) {
        showToast("This emergency has been completed", "info");
        setTimeout(() => navigate("/police"), 2000);
      }
    };

    onDriverLocation(handleDriverLocation);
    socket.on("booking:completed", handleBookingCompleted);

    return () => {
      socket.off("driver:location");
      socket.off("booking:completed", handleBookingCompleted);
    };
  }, [booking, navigate, showToast]);

  if (loading) {
    return (
      <div className="police-booking-detail">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading emergency details...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="police-booking-detail">
        <div className="error-state">
          <h2>⚠️ {error || "Booking not found"}</h2>
          <button className="back-btn" onClick={() => navigate("/police")}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="police-booking-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate("/police")}>
          ← Back to Dashboard
        </button>
        <div className="header-info">
          <h1>Emergency #{booking._id.slice(-8).toUpperCase()}</h1>
          <span className={`status-badge status-${booking.status}`}>
            {booking.status}
          </span>
        </div>
        {driverLocation && (
          <div className="live-tracking-badge">
            <span className="pulse-dot"></span>
            Live Tracking Active
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="detail-content">
        {/* Left Side: Map */}
        <div className="map-section-full">
          <div className="map-header">
            <h2>Live Location Tracking</h2>
            <div className="map-legend-inline">
              <span className="legend-item"><span className="dot red"></span> Pickup</span>
              <span className="legend-item"><span className="dot green"></span> Hospital</span>
              <span className="legend-item"><span className="route-line orange"></span> Driver → Pickup</span>
              <span className="legend-item"><span className="route-line blue"></span> Pickup → Hospital</span>
            </div>
          </div>
          <div className="police-map-full" ref={mapRef}></div>
        </div>

        {/* Right Side: Details */}
        <div className="info-section-full">
          {/* Patient Info */}
          <div className="info-card">
            <div className="card-header">
              <h3>Patient Information</h3>
            </div>
            <div className="card-content">
              <div className="info-row">
                <span className="label">Name</span>
                <span className="value">{booking.user?.username || "Unknown"}</span>
              </div>
              <div className="info-row">
                <span className="label">Mobile</span>
                <a href={`tel:${booking.user?.mobile}`} className="value phone">
                  📞 {booking.user?.mobile || "N/A"}
                </a>
              </div>
            </div>
          </div>

          {/* Driver Info */}
          <div className="info-card">
            <div className="card-header">
              <h3>Ambulance Driver</h3>
            </div>
            <div className="card-content">
              <div className="info-row">
                <span className="label">Driver Name</span>
                <span className="value">{booking.driver?.username || "Not Assigned"}</span>
              </div>
              <div className="info-row">
                <span className="label">Mobile</span>
                <a href={`tel:${booking.driver?.mobile}`} className="value phone">
                  📞 {booking.driver?.mobile || "N/A"}
                </a>
              </div>
              <div className="info-row">
                <span className="label">Vehicle Number</span>
                <span className="value vehicle">{booking.driver?.vehicleNumber || "N/A"}</span>
              </div>
            </div>
          </div>

          {/* Location Info */}
          <div className="info-card locations">
            <div className="card-header">
              <h3>Route Details</h3>
            </div>
            <div className="card-content">
              <div className="location-item pickup">
                <div className="location-marker-circle red">P</div>
                <div className="location-text">
                  <span className="location-label">Pickup Location</span>
                  <span className="location-addr">{pickupAddress || "Loading..."}</span>
                </div>
              </div>
              <div className="route-arrow">
                <span>↓</span>
              </div>
              <div className="location-item destination">
                <div className="location-marker-circle green">D</div>
                <div className="location-text">
                  <span className="location-label">Hospital / Destination</span>
                  <span className="location-addr">{destAddress || booking.destination || "Loading..."}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Time Info */}
          <div className="info-card">
            <div className="card-header">
              <h3>Booking Time</h3>
            </div>
            <div className="card-content">
              <div className="info-row">
                <span className="label">Booked At</span>
                <span className="value">{new Date(booking.timestamp).toLocaleString()}</span>
              </div>
              {booking.acceptedAt && (
                <div className="info-row">
                  <span className="label">Accepted At</span>
                  <span className="value">{new Date(booking.acceptedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoliceBookingDetail;
