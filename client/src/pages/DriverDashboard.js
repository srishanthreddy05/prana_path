import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { joinBookingRoom, emitDriverLocation, onUserLocation, getSocket } from "../utils/socket";
import { getAmbulanceIconUrl, getPoliceIconUrl } from "../utils/mapIcons";
import { authFetch } from "../utils/api";
import "../styles/DriverDashboard.css";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const DriverDashboard = ({ showToast }) => {
  const [onDuty, setOnDuty] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [activeBooking, setActiveBooking] = useState(null);
  const [requestingTrafficVolunteers, setRequestingTrafficVolunteers] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [userLocation, setUserLocation] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [driverLocation, setDriverLocation] = useState(null);
  const [addresses, setAddresses] = useState({});
  const [driverProfile, setDriverProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [dismissedBookings, setDismissedBookings] = useState(new Set());
  const [isCancelling, setIsCancelling] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const pickupMarker = useRef(null);
  const destinationMarker = useRef(null);
  const driverMarker = useRef(null);
  const policeMarkers = useRef([]);
  // eslint-disable-next-line no-unused-vars
  const directionsRenderer = useRef(null);
  const driverToPickupRenderer = useRef(null);
  const pickupToDestRenderer = useRef(null);
  const trackingInterval = useRef(null);
  const locationWatchId = useRef(null);
  const dutySessionActive = useRef(false);
  const navigate = useNavigate();

  // Check if all required profile fields are filled
  const isProfileComplete = (profile) => {
    if (!profile) {
      console.log("Profile is null or undefined");
      return false;
    }
    const requiredFields = ['displayName', 'mobile', 'dob', 'area', 'pincode', 'vehicleNumber'];
    const missingFields = requiredFields.filter(field => !profile[field] || profile[field].toString().trim() === '');
    console.log("Profile data:", profile);
    console.log("Missing fields:", missingFields);
    return missingFields.length === 0;
  };

  const requestLocationPermission = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ granted: false, error: new Error("Geolocation is not supported") });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ granted: true, position }),
        (error) => resolve({ granted: false, error }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const stopOnDutyTracking = () => {
    if (locationWatchId.current !== null) {
      navigator.geolocation.clearWatch(locationWatchId.current);
      locationWatchId.current = null;
    }
  };

  const startOnDutyTracking = useCallback((initialPosition) => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported", "error");
      return;
    }

    stopOnDutyTracking();
    const socket = getSocket();

    const emitLocation = (coords) => {
      if (!driverProfile?._id || !onDuty) return;
      socket.emit("driver:locationUpdate", {
        driverId: driverProfile._id,
        lat: coords.lat,
        lng: coords.lng,
      });
    };

    const pushLocation = async (coords) => {
      setDriverLocation(coords);
      emitLocation(coords);

      // Persist location for pending bookings proximity filters
      if (onDuty) {
        try {
          await authFetch("/users/driver/location", {
            method: "PUT",
            body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
          });
        } catch (err) {
          console.error("Failed to persist driver location:", err);
        }
      }
    };

    if (initialPosition?.coords) {
      pushLocation({
        lat: initialPosition.coords.latitude,
        lng: initialPosition.coords.longitude,
      });
    }

    dutySessionActive.current = true;
    locationWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        pushLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (error) => {
        console.error("Geolocation watch error:", error);
        showToast("Unable to track location. Please enable location services.", "error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, [driverProfile, onDuty, showToast]);

  // Fetch driver profile to get current duty status
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authFetch("/users/profile");
        if (res.ok) {
          const data = await res.json();
          console.log("Fetched driver profile:", data);
          setDriverProfile(data);
          setOnDuty(data.onDuty || false);
        } else {
          console.error("Failed to fetch profile, status:", res.status);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      }
    };
    fetchProfile();
  }, []);

  // Fetch pending bookings when on duty
  useEffect(() => {
    if (!onDuty) {
      setPendingBookings([]);
      return;
    }

    const fetchBookings = async () => {
      try {
        const res = await authFetch("/bookings/pending");
        if (res.ok) {
          const data = await res.json();
          // Filter out dismissed bookings
          const filteredData = data.filter(booking => !dismissedBookings.has(booking._id));
          setPendingBookings(filteredData);
          filteredData.forEach(booking => {
            if (booking.pickupLat && booking.pickupLng) {
              getAddressFromCoords(booking._id, booking.pickupLat, booking.pickupLng);
            }
          });
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch bookings", "error");
      }
    };

    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, [onDuty, showToast, dismissedBookings]);

  useEffect(() => {
    let cancelled = false;

    const resumeTrackingIfNeeded = async () => {
      if (!onDuty) {
        const wasOnDutySession = dutySessionActive.current;

        if (locationWatchId.current !== null) {
          stopOnDutyTracking();
        }

        if (wasOnDutySession && driverProfile?._id) {
          const socket = getSocket();
          socket.emit("driver:offDuty", { driverId: driverProfile._id });
        }

        dutySessionActive.current = false;
        return;
      }

      if (locationWatchId.current !== null) return;

      const permission = await requestLocationPermission();

      if (!permission.granted) {
        if (!cancelled) {
          setOnDuty(false);
          try {
            await authFetch("/users/duty", {
              method: "PUT",
              body: JSON.stringify({ onDuty: false }),
            });
          } catch (err) {
            console.error("Failed to sync off-duty state after permission denial:", err);
          }
          showToast("Location permission is required to stay on duty", "error");
        }
        return;
      }

      if (cancelled) return;

      if (driverProfile?._id) {
        const socket = getSocket();
        socket.emit("driver:onDuty", { driverId: driverProfile._id });
      }

      dutySessionActive.current = true;
      startOnDutyTracking(permission.position);
    };

    resumeTrackingIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [onDuty, driverProfile, showToast, startOnDutyTracking]);

  // Initialize Google Map when active booking exists
  useEffect(() => {
    if (!activeBooking || !window.google || !mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        zoom: 12,
        center: { lat: activeBooking.pickupLat, lng: activeBooking.pickupLng },
        mapTypeId: "roadmap",
      });
    }

    // Add pickup marker
    if (pickupMarker.current) pickupMarker.current.setMap(null);
    pickupMarker.current = new window.google.maps.Marker({
      position: { lat: activeBooking.pickupLat, lng: activeBooking.pickupLng },
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
      position: { lat: activeBooking.destLat, lng: activeBooking.destLng },
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
        console.log("🚔 Fetching police locations for booking:", activeBooking._id);
        const res = await authFetch(`/bookings/${activeBooking._id}/police-locations`);
        console.log("🚔 Police locations response status:", res.status);
        if (res.ok) {
          const locations = await res.json();
          console.log("🚔 Police locations received:", locations);
          
          // Clear existing police markers
          policeMarkers.current.forEach(marker => marker.setMap(null));
          policeMarkers.current = [];
          
          // Add police markers
          if (locations.length === 0) {
            console.log("🚔 No police locations to display");
          }
          locations.forEach(police => {
            console.log("🚔 Adding police marker at:", police.lat, police.lng);
            
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
            
            // Add info window for police marker
            const infoWindow = new window.google.maps.InfoWindow({
              content: `<div style="font-weight:bold;">🚔 ${police.name}</div><div>${police.station}</div>`,
            });
            marker.addListener("click", () => {
              infoWindow.open(mapInstance.current, marker);
            });
            
            policeMarkers.current.push(marker);
            console.log("🚔 Police marker added successfully");
          });
        } else {
          const errorData = await res.json();
          console.error("🚔 Failed to fetch police locations:", errorData);
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
        origin: { lat: activeBooking.pickupLat, lng: activeBooking.pickupLng },
        destination: { lat: activeBooking.destLat, lng: activeBooking.destLng },
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
    joinBookingRoom(activeBooking._id, "driver");

    // Listen for booking cancellation by user
    const socket = getSocket();
    const handleBookingCancelled = (payload) => {
      const payloadId = payload?.bookingId || payload?._id;
      
      if (payloadId && String(payloadId) !== String(activeBooking._id)) {
        return;
      }
      
      // Set cancellation message to display in UI
      setCancellationMessage("⚠️ User has cancelled the booking");
      showToast("⚠️ User has cancelled the booking", "error");
      
      // Delay setting activeBooking to null to ensure state updates are processed
      setTimeout(() => {
        setActiveBooking(null);
      }, 100);
      
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      // Clear map markers
      if (pickupMarker.current) pickupMarker.current.setMap(null);
      if (destinationMarker.current) destinationMarker.current.setMap(null);
      if (driverMarker.current) driverMarker.current.setMap(null);
      policeMarkers.current.forEach(marker => marker.setMap(null));
      policeMarkers.current = [];
    };
    socket.on("bookingCancelled", handleBookingCancelled);

    const handleAmbulanceStuck = (payload) => {
      if (String(payload?.bookingId) !== String(activeBooking._id)) return;
      showToast("⚠️ Ambulance may be stuck. Nearby support is being notified.", "warning");
    };

    const handleAmbulanceReassigning = (payload) => {
      if (String(payload?.bookingId) !== String(activeBooking._id)) return;
      showToast("🔄 Delay detected. Searching for a faster alternative responder.", "info");
    };

    socket.on("ambulance:stuck", handleAmbulanceStuck);
    socket.on("ambulance:reassigning", handleAmbulanceReassigning);

    // Listen for user location updates
    onUserLocation((userLoc) => {
      if (userLoc && userLoc.lat && userLoc.lng) {
        setUserLocation({ lat: userLoc.lat, lng: userLoc.lng });
      }
    });

    // Function to draw route from driver to pickup
    const drawDriverToPickupRoute = (driverLoc) => {
      if (!mapInstance.current) {
        console.log("Map not ready");
        return;
      }
      
      console.log("Drawing driver to pickup route from:", driverLoc, "to:", { lat: activeBooking.pickupLat, lng: activeBooking.pickupLng });
      
      const directionsServiceLocal = new window.google.maps.DirectionsService();
      
      // Create a new renderer each time to ensure it works
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
          destination: { lat: activeBooking.pickupLat, lng: activeBooking.pickupLng },
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (response, status) => {
          console.log("Driver to pickup route status:", status);
          if (status === "OK" && driverToPickupRenderer.current) {
            driverToPickupRenderer.current.setDirections(response);
            console.log("Orange route drawn successfully");
          } else {
            console.error("Failed to draw driver route:", status);
          }
        }
      );
    };

    // Start sharing driver location and draw route
    if (navigator.geolocation) {
      console.log("Starting geolocation tracking...");
      // Get initial position immediately
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log("Got driver location:", loc);
          setDriverLocation(loc);
          emitDriverLocation(activeBooking._id, loc.lat, loc.lng);
          updateDriverMarker(loc);
          
          // Call drawDriverToPickupRoute after a small delay to ensure map is ready
          setTimeout(() => {
            drawDriverToPickupRoute(loc);
          }, 500);
          
          // Fit map bounds to show all markers
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(loc);
          bounds.extend({ lat: activeBooking.pickupLat, lng: activeBooking.pickupLng });
          bounds.extend({ lat: activeBooking.destLat, lng: activeBooking.destLng });
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
            setDriverLocation(loc);
            emitDriverLocation(activeBooking._id, loc.lat, loc.lng);
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
      // Clear police markers on cleanup
      policeMarkers.current.forEach(marker => marker.setMap(null));
      policeMarkers.current = [];
      // Remove socket listener
      socket.off("bookingCancelled", handleBookingCancelled);
      socket.off("ambulance:stuck", handleAmbulanceStuck);
      socket.off("ambulance:reassigning", handleAmbulanceReassigning);
    };
  }, [activeBooking, showToast]);

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

  const getAddressFromCoords = async (bookingId, lat, lng) => {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        setAddresses(prev => ({
          ...prev,
          [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        }));
        return;
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.status === "OK" && data.results && data.results[0]) {
        setAddresses(prev => ({
          ...prev,
          [bookingId]: data.results[0].formatted_address
        }));
      } else {
        setAddresses(prev => ({
          ...prev,
          [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        }));
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setAddresses(prev => ({
        ...prev,
        [bookingId]: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }));
    }
  };

  const handleDutyToggle = async () => {
    try {
      const newStatus = !onDuty;
      let permissionResult = null;
      
      // Check if profile is complete before turning on duty
      if (newStatus) {
        if (!isProfileComplete(driverProfile)) {
          setProfileError("Please fill all the details in your profile");
          // Auto-clear error after 5 seconds
          setTimeout(() => setProfileError(""), 5000);
          return;
        }

        permissionResult = await requestLocationPermission();

        if (!permissionResult.granted) {
          const permissionMessage = permissionResult.error?.code === 1
            ? "Location permission denied. Please enable location to go on duty."
            : "Unable to access location. Please enable location services.";

          setOnDuty(false);
          showToast(permissionMessage, "error");
          return;
        }
      }
      
      // Clear any existing error
      setProfileError("");
      
      const res = await authFetch("/users/duty", {
        method: "PUT",
        body: JSON.stringify({ onDuty: newStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.message || "Failed to update duty status", "error");
        return;
      }

      setOnDuty(newStatus);

      if (newStatus) {
        const socket = getSocket();
        if (driverProfile?._id) {
          socket.emit("driver:onDuty", { driverId: driverProfile._id });
        }
        dutySessionActive.current = true;
        startOnDutyTracking(permissionResult?.position);
        showToast("✅ You are now on duty", "success");
      } else {
        const wasOnDutySession = dutySessionActive.current;
        stopOnDutyTracking();
        if (wasOnDutySession && driverProfile?._id) {
          const socket = getSocket();
          socket.emit("driver:offDuty", { driverId: driverProfile._id });
        }
        dutySessionActive.current = false;
        setPendingBookings([]);
        showToast("⚠️ You are now off duty", "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update duty status", "error");
    }
  };

  // Dismiss a booking request (driver doesn't want to accept it)
  const dismissBooking = (id) => {
    // Add to dismissed set so it won't reappear on next fetch
    setDismissedBookings(prev => new Set([...prev, id]));
    setPendingBookings(prev => prev.filter(b => b._id !== id));
    showToast("Booking dismissed", "info");
  };

  const acceptBooking = async (id) => {
    try {
      const res = await authFetch(`/bookings/${id}/accept`, {
        method: "PUT",
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.message || "Failed to accept booking", "error");
        return;
      }

      const updated = await res.json();
      showToast("✅ Booking accepted!", "success");
      setPendingBookings(prev => prev.filter(b => b._id !== id));
      setActiveBooking(updated);
    } catch (err) {
      console.error(err);
      showToast("Failed to accept booking", "error");
    }
  };

  const completeBooking = async () => {
    if (!activeBooking) {
      showToast("No active booking to complete", "error");
      return;
    }

    try {
      const res = await authFetch(`/bookings/${activeBooking._id}/complete`, {
        method: "PUT",
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.message || "Failed to complete booking", "error");
        return;
      }
      
      showToast("✅ Booking completed!", "success");
      setActiveBooking(null);
      
      // Clear map markers
      if (pickupMarker.current) pickupMarker.current.setMap(null);
      if (destinationMarker.current) destinationMarker.current.setMap(null);
      if (driverMarker.current) driverMarker.current.setMap(null);
      // Clear police markers
      policeMarkers.current.forEach(marker => marker.setMap(null));
      policeMarkers.current = [];
      
      // Navigate to history
      navigate("/driver/history");
    } catch (err) {
      console.error(err);
      showToast("Failed to complete booking", "error");
    }
  };

  // Cancel booking by driver
  const cancelBooking = async () => {
    if (!activeBooking?._id) return;
    
    setIsCancelling(true);
    try {
      const res = await authFetch(`/bookings/${activeBooking._id}/driver-cancel`, {
        method: "PUT",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to cancel booking");
      }
      
      showToast("⚠️ Booking cancelled. User will be notified to search for another driver.", "info");
      setActiveBooking(null);
      
      // Clear map markers
      if (pickupMarker.current) pickupMarker.current.setMap(null);
      if (destinationMarker.current) destinationMarker.current.setMap(null);
      if (driverMarker.current) driverMarker.current.setMap(null);
      policeMarkers.current.forEach(marker => marker.setMap(null));
      policeMarkers.current = [];
      
      if (trackingInterval.current) clearInterval(trackingInterval.current);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to cancel booking", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRequestTrafficVolunteers = async () => {
    if (!activeBooking?._id || requestingTrafficVolunteers) return;

    if (!navigator.geolocation) {
      showToast("Geolocation is required to alert traffic volunteers", "error");
      return;
    }

    setRequestingTrafficVolunteers(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await authFetch("/volunteers/alert-traffic", {
            method: "POST",
            body: JSON.stringify({
              bookingId: activeBooking._id,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.message || "Failed to notify traffic volunteers", "error");
            return;
          }
          showToast(data.message || "Traffic volunteers alerted", "success");
        } catch (err) {
          console.error(err);
          showToast("Failed to notify traffic volunteers", "error");
        } finally {
          setRequestingTrafficVolunteers(false);
        }
      },
      () => {
        setRequestingTrafficVolunteers(false);
        showToast("Unable to access current location", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    return () => {
      stopOnDutyTracking();
      dutySessionActive.current = false;
    };
  }, []);

  return (
    <div className="driver-dashboard">
      <h2 className="driver-title-top">Driver Dashboard</h2>
      
      {/* Duty Toggle */}
      <div className="duty-toggle-container">
        <label className="duty-toggle-label" onClick={handleDutyToggle}>
          <span>Go On Duty</span>
          <div className={`duty-toggle-switch ${onDuty ? 'active' : ''}`}></div>
        </label>
        <span className={`duty-status-badge ${onDuty ? 'on-duty' : 'off-duty'}`}>
          {onDuty ? "On Duty" : "Off Duty"}
        </span>
        {profileError && (
          <span className="profile-error-message">{profileError}</span>
        )}
      </div>

      {/* Active Booking View with Map */}
      {activeBooking ? (
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
                <div className="card-content">
                  <div className="info-row">
                    <span className="label">Name</span>
                    <span className="value">{activeBooking.user?.username || "Unknown"}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Mobile</span>
                    <a href={`tel:${activeBooking.user?.mobile}`} className="value phone">
                      📞 {activeBooking.user?.mobile || "N/A"}
                    </a>
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
                      <span className="location-addr">{addresses[activeBooking._id] || "Loading address..."}</span>
                    </div>
                  </div>
                  <div className="route-arrow">
                    <span>↓</span>
                  </div>
                  <div className="location-item destination">
                    <div className="location-marker-circle green">D</div>
                    <div className="location-text">
                      <span className="location-label">Hospital / Destination</span>
                      <span className="location-addr">{activeBooking.destination}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  onClick={handleRequestTrafficVolunteers}
                  className="btn-traffic-volunteers"
                  disabled={requestingTrafficVolunteers}
                >
                  {requestingTrafficVolunteers ? "Requesting Help..." : "🚦 Request Traffic Volunteers"}
                </button>
                <button onClick={completeBooking} className="btn-complete">
                  ✓ Mark as Completed
                </button>
                <button 
                  onClick={cancelBooking} 
                  className="btn-cancel-booking"
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling..." : "✕ Cancel Booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Pending Requests */}
          {onDuty ? (
            <div className="driver-section">
              <h3 className="driver-section-title">
                Pending Requests <span className="count-badge">{pendingBookings.length}</span>
              </h3>
              {pendingBookings.length === 0 ? (
                <p className="muted">No pending requests available</p>
              ) : (
                pendingBookings.map((b) => (
                  <div key={b._id} className="driver-card">
                    <p><strong>Patient:</strong> {b.user?.username} ({b.user?.mobile})</p>
                    <p><strong>Pickup:</strong> {addresses[b._id] || "Loading address..."}</p>
                    <p><strong>Destination:</strong> {b.destination}</p>
                    <div className="booking-action-buttons">
                      <button onClick={() => acceptBooking(b._id)} className="btn accept">
                        Accept Request
                      </button>
                      <button onClick={() => dismissBooking(b._id)} className="btn dismiss">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="off-duty-message">
              <p>Toggle "Go On Duty" to start receiving booking requests</p>
            </div>
          )}

          {/* Cancellation Message */}
          {cancellationMessage && (
            <div className="cancellation-alert">
              <span>{cancellationMessage}</span>
              <button onClick={() => setCancellationMessage("")} className="dismiss-btn">×</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DriverDashboard;
