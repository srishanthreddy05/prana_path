/**
 * Hook for managing driver location updates
 * Tracks driver location and shares it with server via API and Socket.IO
 */

import { useEffect, useRef, useState } from "react";
import { getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";

export const useDriverLocation = (driverId, showToast) => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const watchIdRef = useRef(null);

  // Start tracking location
  const startTracking = (onDuty = true) => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported", "error");
      return;
    }

    // Update on-duty status
    updateOnDutyStatus(onDuty);

    // Watch position (continuous updates)
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });

        // Update location on server
        try {
          await authFetch("/users/driver/location", {
            method: "PUT",
            body: JSON.stringify({ lat: latitude, lng: longitude }),
          });

          // Emit to socket for real-time updates
          const socket = getSocket();
          socket.emit("driver:locationUpdate", {
            driverId,
            lat: latitude,
            lng: longitude,
          });
        } catch (error) {
          console.error("Failed to update location:", error);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast("Failed to get location. Please enable location services.", "error");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000, // Update every 5 seconds
      }
    );

    setIsTracking(true);
  };

  // Stop tracking location
  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    updateOnDutyStatus(false);
    setIsTracking(false);
  };

  // Update driver's on-duty status
  const updateOnDutyStatus = async (onDuty) => {
    try {
      await authFetch("/users/duty", {
        method: "PUT",
        body: JSON.stringify({ onDuty }),
      });
    } catch (error) {
      console.error("Failed to update on-duty status:", error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    currentLocation,
    startTracking,
    stopTracking,
  };
};
