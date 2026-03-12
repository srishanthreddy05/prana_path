// Custom hook for location operations
import { useState, useCallback } from "react";
import { getCurrentLocation, reverseGeocode, geocodeAddress } from "../services/locationService";

// mapManagerRef is expected to be a ref object (e.g. useRef) so we can safely
// reference the up-to-date MapManager instance once it's initialized.
export const useLocation = (mapManagerRef, showToast) => {
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [locationMode, setLocationMode] = useState("auto");
  const [manualClickState, setManualClickState] = useState({ pickupSet: false, destinationSet: false });

  const captureCurrentLocation = useCallback(async () => {
    try {
      const loc = await getCurrentLocation();
      const position = { lat: loc.latitude, lng: loc.longitude };
      
      // Reverse geocode to get actual address instead of "My Location"
      const address = await reverseGeocode(position);
      setPickup(address);

      const notifyPickupSet = () => showToast("📍 Using your current location as pickup.", "info");

      // Wait for map manager instance to be ready before adding markers
      const ensureMapAndAdd = () => {
        const mm = mapManagerRef && mapManagerRef.current;
        if (mm && mm.mapInstance) {
          mm.addPickupMarker(position);
          setManualClickState(prev => ({ ...prev, pickupSet: true }));
          notifyPickupSet();
          return true;
        }
        return false;
      };

      if (!ensureMapAndAdd()) {
        // retry a few times if the map isn't ready yet
        let attempts = 0;
        const timer = setInterval(() => {
          attempts += 1;
          if (ensureMapAndAdd() || attempts > 10) {
            clearInterval(timer);
          }
        }, 200);
      }
    } catch (err) {
      showToast("Failed to get your current location.", "error");
    }
  }, [mapManagerRef, showToast]);

  const handleMapClick = useCallback(async (loc) => {
    const address = await reverseGeocode(loc);

    const mm = mapManagerRef && mapManagerRef.current;

    if (locationMode === "manual") {
      if (!manualClickState.pickupSet) {
        setPickup(address);
        if (mm && mm.mapInstance) mm.addPickupMarker(loc);
        setManualClickState(prev => ({ ...prev, pickupSet: true }));
        showToast("Pickup location set!", "success");
      } else if (!manualClickState.destinationSet) {
        setDestination(address);
        if (mm && mm.mapInstance) mm.addDestinationMarker(loc);
        setManualClickState(prev => ({ ...prev, destinationSet: true }));
        showToast("Destination set!", "success");
      } else {
        setDestination(address);
        if (mm && mm.mapInstance) mm.addDestinationMarker(loc);
      }
    } else {
      setDestination(address);
      if (mm && mm.mapInstance) mm.addDestinationMarker(loc);
      showToast("Destination set!", "success");
    }
  }, [locationMode, manualClickState, mapManagerRef, showToast]);

  const toggleLocationMode = useCallback((mode) => {
    setLocationMode(mode);
    if (mode === "auto") {
      captureCurrentLocation();
      setManualClickState({ pickupSet: true, destinationSet: false });
    } else {
      setPickup("");
      setDestination("");
      const mm = mapManagerRef && mapManagerRef.current;
      if (mm && mm.mapInstance) mm.clearMarkers();
      setManualClickState({ pickupSet: false, destinationSet: false });
    }
  }, [captureCurrentLocation, mapManagerRef]);

  const handlePickupSelected = useCallback((address, loc) => {
    setPickup(address);
    const mm = mapManagerRef && mapManagerRef.current;
    if (mm && mm.mapInstance) mm.addPickupMarker(loc);
    setManualClickState(prev => ({ ...prev, pickupSet: true }));
  }, [mapManagerRef]);

  const handleDestinationSelected = useCallback((address, loc) => {
    setDestination(address);
    const mm = mapManagerRef && mapManagerRef.current;
    if (mm && mm.mapInstance) mm.addDestinationMarker(loc);
    setManualClickState(prev => ({ ...prev, destinationSet: true }));
  }, [mapManagerRef]);

  const validateAndGetDestinationCoords = useCallback(async () => {
    const mm = mapManagerRef && mapManagerRef.current;
    const destPosition = mm ? mm.getDestinationPosition() : null;
    
    if (destPosition) {
      return {
        lat: destPosition.lat(),
        lng: destPosition.lng()
      };
    } else {
      // Geocode the typed destination string
      const geocodeResult = await geocodeAddress(destination);
      if (!geocodeResult) {
        throw new Error("Could not locate the destination. Please select from suggestions or click on map.");
      }
      
      const coords = {
        lat: geocodeResult.geometry.location.lat(),
        lng: geocodeResult.geometry.location.lng()
      };
      
      // Place destination marker on map for consistency
      if (mm && mm.mapInstance) mm.addDestinationMarker(coords);
      return coords;
    }
  }, [destination, mapManagerRef]);

  return {
    pickup,
    setPickup,
    destination,
    setDestination,
    locationMode,
    manualClickState,
    captureCurrentLocation,
    handleMapClick,
    toggleLocationMode,
    handlePickupSelected,
    handleDestinationSelected,
    validateAndGetDestinationCoords
  };
};
