// src/pages/BookAmbulance.js - Refactored
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import { MapManager, initializeAutocomplete } from "../utils/mapUtils";
import { useLocation } from "../hooks/useLocation";
import { useBookingSocket } from "../hooks/useBookingSocket";
import { createBooking, getBookingById, checkPendingBooking, cancelBooking } from "../services/bookingService";
import { calculateETA, getCurrentLocation, reverseGeocode } from "../services/locationService";
import { SearchingOverlay, DriverPanel } from "../components/BookingStatus";
import "../styles/bookAmbulance.css";
import { useProfileCompletion } from "../hooks/useProfileCompletion";

const EMERGENCY_OPTIONS = {
  accident: {
    label: "Accident",
    situations: ["Heavy Bleeding", "Unconscious Person", "Head Injury", "Fracture", "Road Accident"],
  },
  health: {
    label: "Health Emergency",
    situations: ["Cardiac Arrest", "Chest Pain", "Stroke Symptoms", "Breathing Difficulty", "Severe Allergic Reaction"],
  },
  general: {
    label: "General Visit",
    situations: ["Normal Checkup", "Fever / Infection", "Pregnancy Checkup", "Child Health", "Routine Consultation"],
  },
};

const situationSearchKeywords = {
  "Heavy Bleeding": ["trauma center", "emergency hospital"],
  "Unconscious Person": ["emergency hospital", "trauma center"],
  "Head Injury": ["trauma center", "neurosurgery hospital"],
  Fracture: ["orthopedic hospital", "trauma center"],
  "Road Accident": ["trauma center", "emergency hospital"],
  "Cardiac Arrest": ["cardiology hospital", "heart hospital", "emergency hospital"],
  "Chest Pain": ["cardiology hospital", "emergency hospital"],
  "Stroke Symptoms": ["neurology hospital", "stroke center", "emergency hospital"],
  "Breathing Difficulty": ["pulmonology hospital", "emergency hospital"],
  "Severe Allergic Reaction": ["emergency hospital"],
  "Normal Checkup": ["general hospital", "clinic"],
  "Fever / Infection": ["general hospital", "clinic"],
  "Pregnancy Checkup": ["maternity hospital", "gynecology hospital"],
  "Child Health": ["pediatric hospital"],
  "Routine Consultation": ["general hospital", "clinic"],
};

const VOICE_MULTI_SPECIALTY_KEYWORDS = [
  "multi specialty hospital",
  "multispeciality hospital",
];

const getSituationKeywords = (selectedSituation) => situationSearchKeywords[selectedSituation] || ["hospital"];

const computeKeywordPriorityScore = (hospital, keywords) => {
  const haystack = [hospital.name, hospital.address, ...(hospital.types || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return keywords.reduce((score, keyword, index) => {
    if (!haystack.includes(keyword.toLowerCase())) {
      return score;
    }

    const exactNameMatch = hospital.name?.toLowerCase().includes(keyword.toLowerCase()) ? 18 : 0;
    const exactAddressMatch = hospital.address?.toLowerCase().includes(keyword.toLowerCase()) ? 10 : 0;
    const keywordWeight = Math.max(20 - index * 3, 8);

    return score + keywordWeight + exactNameMatch + exactAddressMatch;
  }, 0) + ((hospital.rating || 0) * 2);
};

const nearbySearchByKeyword = (placesService, userLocation, keyword) => new Promise((resolve, reject) => {
  placesService.nearbySearch(
    {
      location: userLocation,
      radius: 5000,
      keyword,
    },
    (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK || status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve(results || []);
        return;
      }

      reject(new Error(`Nearby search failed for ${keyword}`));
    }
  );
});

const getTravelTimes = (userLocation, hospitals) => new Promise((resolve, reject) => {
  const distanceMatrixService = new window.google.maps.DistanceMatrixService();

  distanceMatrixService.getDistanceMatrix(
    {
      origins: [userLocation],
      destinations: hospitals.map((hospital) => hospital.location),
      travelMode: window.google.maps.TravelMode.DRIVING,
      unitSystem: window.google.maps.UnitSystem.METRIC,
    },
    (response, status) => {
      if (status === "OK") {
        resolve(response);
        return;
      }

      reject(new Error("Unable to calculate travel time for nearby hospitals."));
    }
  );
});

const getEmergencyTypeKey = (value) => {
  if (!value) return "general";

  const normalized = value.toString().trim().toLowerCase();

  if (EMERGENCY_OPTIONS[normalized]) {
    return normalized;
  }

  const matched = Object.entries(EMERGENCY_OPTIONS).find(([, option]) =>
    option.label.toLowerCase() === normalized
  );

  return matched?.[0] || "general";
};

const getSituationValue = (emergencyTypeKey, value) => {
  const situations = EMERGENCY_OPTIONS[emergencyTypeKey]?.situations || [];

  if (!situations.length) {
    return "";
  }

  if (!value) {
    return situations[0];
  }

  const normalized = value.toString().trim().toLowerCase();
  const matched = situations.find((item) => item.toLowerCase() === normalized);

  return matched || situations[0];
};

function BookAmbulance({ showToast }) {
  // Booking state
  const [bookingStatus, setBookingStatus] = useState(null); // null, 'searching', 'accepted', 'completed', 'timeout'
  const [currentBooking, setCurrentBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [searchingTime, setSearchingTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const [emergencyType, setEmergencyType] = useState("");
  const [situation, setSituation] = useState("");
  const [recommendedHospitals, setRecommendedHospitals] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  
  // Search timeout constant (90 seconds)
  const SEARCH_TIMEOUT_SECONDS = 90;

  // Refs
  const mapRef = useRef(null);
  const mapManagerRef = useRef(null);
  const statusPollingRef = useRef(null);
  const driverLocationPollingRef = useRef(null);
  const voiceAutoRunRef = useRef(false);
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();

  // Profile completion status
  const { isProfileComplete } = useProfileCompletion(localStorage.getItem("isLoggedIn") === "true");

  // Stable refs for passing latest callbacks into the map listener
  const handleMapClickRef = useRef(null);
  const handlePickupSelectedRef = useRef(null);
  const handleDestinationSelectedRef = useRef(null);
  const captureCurrentLocationRef = useRef(null);

  // Initialize map manager once and wire a stable click handler that delegates to the latest
  // callbacks via refs. This prevents re-initializing the Google Map when callback identities change
  // (which caused the blinking behavior).
  useEffect(() => {
    if (!mapManagerRef.current) {
      mapManagerRef.current = new MapManager(mapRef, showToast);
    }

    const stableMapClickHandler = (loc) => {
      if (handleMapClickRef.current) handleMapClickRef.current(loc);
    };

    // Initialize the map once with the stable handler
    if (window.google) {
      mapManagerRef.current.initializeMap(stableMapClickHandler);

      // Initialize destination autocomplete (always visible)
      initializeAutocomplete(
        null, // Don't initialize pickup yet, as it's conditionally rendered
        "destination-input",
        null,
        (address, loc) => { if (handleDestinationSelectedRef.current) handleDestinationSelectedRef.current(address, loc); }
      );
    }
    // We intentionally run this effect only once on mount to avoid re-initializing the map.
    // Updates to the callbacks are delivered through the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Custom hooks
  const {
    pickup,
    setPickup,
    destination,
    setDestination,
    locationMode,
    manualClickState, // eslint-disable-line no-unused-vars
    captureCurrentLocation,
    handleMapClick,
    toggleLocationMode,
    handlePickupSelected,
    handleDestinationSelected,
    validateAndGetDestinationCoords
  } = useLocation(mapManagerRef, showToast);

  const { setupSocketListeners, stopUserLocationSharing } = useBookingSocket(currentBooking, showToast);

  const situationOptions = emergencyType ? EMERGENCY_OPTIONS[emergencyType]?.situations || [] : [];

  const speak = (text) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  const ensurePickupCoordinates = async () => {
    let pickupPosition = mapManagerRef.current?.getPickupPosition();

    if (!pickupPosition && locationMode === "auto" && captureCurrentLocationRef.current) {
      await captureCurrentLocationRef.current();
      pickupPosition = mapManagerRef.current?.getPickupPosition();
    }

    if (!pickupPosition) {
      try {
        const currentLocation = await getCurrentLocation();
        const coords = { lat: currentLocation.latitude, lng: currentLocation.longitude };
        const resolvedAddress = await reverseGeocode(coords);

        setPickup(resolvedAddress);

        if (mapManagerRef.current) {
          mapManagerRef.current.addPickupMarker(coords);
        }

        return coords;
      } catch (error) {
        return null;
      }
    }

    return {
      lat: typeof pickupPosition.lat === "function" ? pickupPosition.lat() : pickupPosition.lat,
      lng: typeof pickupPosition.lng === "function" ? pickupPosition.lng() : pickupPosition.lng,
    };
  };

  // Keep refs updated with latest callback versions
  useEffect(() => {
    handleMapClickRef.current = handleMapClick;
    handlePickupSelectedRef.current = handlePickupSelected;
    handleDestinationSelectedRef.current = handleDestinationSelected;
    captureCurrentLocationRef.current = captureCurrentLocation;
  }, [handleMapClick, handlePickupSelected, handleDestinationSelected, captureCurrentLocation]);

  // When the user switches to 'auto' mode, capture current location. We use a ref to call
  // the latest version of captureCurrentLocation without re-initializing the map.
  useEffect(() => {
    if (locationMode === "auto" && captureCurrentLocationRef.current) {
      captureCurrentLocationRef.current();
    }
    // When switching to manual mode, initialize pickup autocomplete
    if (locationMode === "manual" && window.google) {
      setTimeout(() => {
        const pickupInput = document.getElementById("manual-location-input");
        if (pickupInput && !pickupInput.autocompleteInitialized) {
          const pickupAutocomplete = new window.google.maps.places.Autocomplete(pickupInput, {
            types: ["establishment", "geocode"],
            componentRestrictions: { country: "in" },
          });
          pickupAutocomplete.addListener("place_changed", () => {
            const place = pickupAutocomplete.getPlace();
            if (place.geometry && handlePickupSelectedRef.current) {
              const loc = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              };
              handlePickupSelectedRef.current(place.formatted_address, loc);
            }
          });
          pickupInput.autocompleteInitialized = true;
        }
      }, 100);
    }
  }, [locationMode]);

  useEffect(() => {
    setRecommendedHospitals([]);
    setSelectedKeywords([]);

    if (mapManagerRef.current) {
      mapManagerRef.current.clearRecommendationMarkers();
    }
  }, [emergencyType, situation]);

  // Handle driver cancellation redirect - auto-search for new driver
  useEffect(() => {
    const handleDriverCancelledRedirect = async () => {
      if (routerLocation.state?.driverCancelled && routerLocation.state?.bookingId) {
        console.log("🔄 Driver cancelled redirect detected, bookingId:", routerLocation.state.bookingId);
        
        // Immediately set to searching state while we fetch booking data
        setBookingStatus("searching");
        setSearchingTime(0);
        setDriver(null);
        setIsTracking(false);
        setDriverLocation(null);
        setEstimatedTime(null);
        
        try {
          // Fetch the updated booking (now back to pending status)
          const booking = await getBookingById(routerLocation.state.bookingId);
          console.log("🔄 Fetched booking:", booking);
          if (booking) {
            setCurrentBooking(booking);
            showToast("🔍 Searching for another ambulance...", "info");
          }
          // Clear the navigation state to prevent re-triggering
          window.history.replaceState({}, document.title);
        } catch (err) {
          console.error("Error fetching booking after driver cancel:", err);
          // Fallback: check for pending booking
          try {
            const { hasPendingBooking, booking } = await checkPendingBooking();
            if (hasPendingBooking && booking) {
              setCurrentBooking(booking);
              showToast("🔍 Searching for another ambulance...", "info");
            }
          } catch (fallbackErr) {
            console.error("Fallback also failed:", fallbackErr);
          }
        }
      }
    };
    
    handleDriverCancelledRedirect();
  }, [routerLocation.state, showToast]);

  // Check for existing pending booking on page load
  useEffect(() => {
    const checkExistingBooking = async () => {
      // Skip if we're handling a driver cancellation redirect
      if (routerLocation.state?.driverCancelled) return;
      
      try {
        const { hasPendingBooking, booking } = await checkPendingBooking();
        if (hasPendingBooking && booking) {
          // Calculate elapsed time since booking was created
          const createdAt = new Date(booking.createdAt);
          const elapsedSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
          
          // Only restore if within the timeout window
          if (elapsedSeconds < SEARCH_TIMEOUT_SECONDS) {
            setCurrentBooking(booking);
            setBookingStatus("searching");
            setSearchingTime(elapsedSeconds); // Resume from where it was
            showToast("🔍 You have an existing booking request. Searching for ambulance...", "info");
          }
        }
      } catch (err) {
        console.error("Error checking pending booking:", err);
      }
    };
    
    checkExistingBooking();
  }, [showToast, routerLocation.state]);

  // Track searching time while in 'searching' state and handle timeout
  useEffect(() => {
    if (bookingStatus !== "searching") return;
    const intervalId = setInterval(() => {
      setSearchingTime((prev) => {
        const newTime = prev + 1;
        // Check for timeout after 90 seconds
        if (newTime >= SEARCH_TIMEOUT_SECONDS) {
          setBookingStatus("timeout");
          showToast("No drivers available at the moment. Please try again later.", "error");
          return newTime;
        }
        return newTime;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [bookingStatus, showToast]);

  // Cleanup on unmount
  useEffect(() => {
    // Copy ref values to variables inside the effect
    const statusInterval = statusPollingRef.current;
    const driverLocationInterval = driverLocationPollingRef.current;
    
    return () => {
      if (statusInterval) clearInterval(statusInterval);
      if (driverLocationInterval) clearInterval(driverLocationInterval);
      stopUserLocationSharing();
    };
  }, [stopUserLocationSharing]);

// Attach socket listeners as soon as booking is available
useEffect(() => {
  if (!currentBooking) return;

  setupSocketListeners(currentBooking, {
    onAccepted: (payload) => {
      console.log("✅ Booking accepted", payload);

      setBookingStatus("accepted");
      setDriver(payload.driver);
      setEstimatedTime(Math.floor(Math.random() * 15) + 5);
      showToast("🚑 Ambulance found! Driver is on the way.", "success");
      setIsTracking(true);

      const payloadBookingId =
        payload?.bookingId ||
        payload?.booking?._id ||
        payload?._id ||
        currentBooking?._id;

      if (payloadBookingId) {
        navigate(`/track/${payloadBookingId}`, {
          state: {
            booking: currentBooking || payload.booking,
            driver: payload.driver,
          },
        });
      }
    },

    onCompleted: () => {
      setBookingStatus("completed");
      showToast("✅ Ride completed! Thank you for using Smart Ambulance.", "success");
      setIsTracking(false);
    },

    // Handle driver cancellation - auto re-search for new driver
    onDriverCancelledCallback: (payload) => {
      console.log("⚠️ Driver cancelled booking", payload);
      showToast("⚠️ Driver cancelled. Searching for another ambulance...", "warning");
      
      // Reset to searching state
      setBookingStatus("searching");
      setDriver(null);
      setIsTracking(false);
      setSearchingTime(0);
      setDriverLocation(null);
      setEstimatedTime(null);
      
      // Navigate back to booking page if on tracking page
      navigate("/book-ambulance");
    },

    onDriverLocationUpdate: async (loc) => {
      setDriverLocation({ lat: loc.lat, lng: loc.lng });
      mapManagerRef.current.addDriverMarker({ lat: loc.lat, lng: loc.lng });

      const pickupPos = mapManagerRef.current.getPickupPosition();
      if (pickupPos) {
        const eta = await calculateETA(
          { lat: loc.lat, lng: loc.lng },
          pickupPos
        );
        if (eta) setEstimatedTime(eta);
      }
    },

    setUserLocation
  });
}, [currentBooking, navigate, setupSocketListeners, showToast]);

  // Fallback polling in case socket event is missed
  useEffect(() => {
    if (!currentBooking || bookingStatus !== "searching") return;

    const poll = async () => {
      try {
        const latest = await getBookingById(currentBooking._id);
        if (latest.status === "accepted") {
          setBookingStatus("accepted");
          setDriver(latest.driver);
          navigate(`/track/${latest._id}`, { state: { booking: latest, driver: latest.driver } });
        }
        if (latest.status === "completed" || latest.status === "cancelled") {
          setBookingStatus(latest.status);
        }
      } catch (err) {
        // swallow errors to keep polling lightweight
      }
    };

    statusPollingRef.current = setInterval(poll, 4000);
    return () => {
      if (statusPollingRef.current) clearInterval(statusPollingRef.current);
      statusPollingRef.current = null;
    };
  }, [bookingStatus, currentBooking, navigate]);




  const handleSubmit = async (e) => {
    e.preventDefault();

    // Block if profile incomplete
    if (!isProfileComplete) {
      navigate("/profile", { state: { requireProfileCompletion: true } });
      return;
    }

    if (!mapManagerRef.current) {
      showToast("⚠ Map is not ready yet. Please wait a moment.", "error");
      return;
    }

    const pickupPosition = mapManagerRef.current.getPickupPosition();
    if (!pickupPosition) {
      showToast("⚠ Please set your pickup location first!", "error");
      return;
    }

    if (!destination.trim()) {
      showToast("⚠ Please enter a destination!", "error");
      return;
    }

    try {
      // Optimistically enter searching state so the user gets feedback immediately
      setBookingStatus("searching");
      setSearchingTime(0);
      showToast("🔍 Searching for nearby ambulance...", "info");
      // Fallback toast in case rendering timing swallows the first one
      setTimeout(() => showToast("🔍 Searching for nearby ambulance...", "info"), 25);

      const destCoords = await validateAndGetDestinationCoords();

      const bookingData = {
        pickup,
        destination,
        pickupLat: pickupPosition.lat(),
        pickupLng: pickupPosition.lng(),
        destLat: destCoords.lat,
        destLng: destCoords.lng,
      };

      const data = await createBooking(bookingData);

      setCurrentBooking(data.booking);
    } catch (err) {
      console.error(err);
      setBookingStatus(null);
      showToast("❌ " + err.message, "error");
    }
  };

  const handleEmergencyChange = (e) => {
    setEmergencyType(e.target.value);
    setSituation("");
  };

  const handleSituationChange = (e) => {
    setSituation(e.target.value);
  };

  const handleRecommendedHospitalSelect = (hospital) => {
    setDestination(`${hospital.name}${hospital.address ? `, ${hospital.address}` : ""}`);

    if (mapManagerRef.current) {
      mapManagerRef.current.addDestinationMarker(hospital.location);
      mapManagerRef.current.focusOnLocation(hospital.location, 14);
    }

    showToast(`${hospital.name} selected as destination hospital.`, "success");
  };

  const fetchRecommendedHospitals = async ({
    selectedEmergencyType = emergencyType,
    selectedSituation = situation,
    customKeywords = null,
    sortByTravelOnly = false,
    suppressToasts = false,
  } = {}) => {
    if (!window.google?.maps?.places) {
      if (!suppressToasts) showToast("Google Maps Places API is not available right now.", "error");
      return [];
    }

    if (!selectedEmergencyType) {
      if (!suppressToasts) showToast("Select an emergency type first.", "error");
      return [];
    }

    if (!selectedSituation && !(Array.isArray(customKeywords) && customKeywords.length > 0)) {
      if (!suppressToasts) showToast("Select a situation first.", "error");
      return [];
    }

    const pickupCoords = await ensurePickupCoordinates();

    if (!pickupCoords) {
      if (!suppressToasts) {
        showToast("Set your pickup location before requesting hospital recommendations.", "error");
      }
      return [];
    }

    const searchOrigin = { lat: pickupCoords.lat, lng: pickupCoords.lng };

    const keywords = Array.isArray(customKeywords) && customKeywords.length > 0
      ? customKeywords
      : getSituationKeywords(selectedSituation);

    if (!keywords.length) {
      if (!suppressToasts) showToast("No hospital search keywords are available for this situation.", "error");
      return [];
    }

    setIsLoadingRecommendations(true);

    try {
      const placesService = new window.google.maps.places.PlacesService(
        mapManagerRef.current?.mapInstance || document.createElement("div")
      );
      const searchResults = await Promise.all(
        keywords.map((keyword) => nearbySearchByKeyword(placesService, searchOrigin, keyword))
      );

      const hospitals = [];

      searchResults.forEach((places, keywordIndex) => {
        const keyword = keywords[keywordIndex];

        places.forEach((place) => {
          const latitude = place.geometry?.location?.lat?.();
          const longitude = place.geometry?.location?.lng?.();

          if (!place.place_id || latitude == null || longitude == null) {
            return;
          }

          hospitals.push({
            place_id: place.place_id,
            name: place.name,
            address: place.vicinity || "",
            rating: place.rating ?? null,
            types: place.types || [],
            location: { lat: latitude, lng: longitude },
            matchedKeyword: keyword,
          });
        });
      });

      const hospitalMap = new Map();

      hospitals.forEach((hospital) => {
        const existingHospital = hospitalMap.get(hospital.place_id);

        if (existingHospital) {
          existingHospital.matchedKeywords = [
            ...new Set([...existingHospital.matchedKeywords, hospital.matchedKeyword].filter(Boolean)),
          ];
          return;
        }

        hospitalMap.set(hospital.place_id, {
          ...hospital,
          matchedKeywords: hospital.matchedKeyword ? [hospital.matchedKeyword] : [],
        });
      });

      const uniqueHospitals = [...hospitalMap.values()].map((hospital) => ({
        ...hospital,
        priorityScore: computeKeywordPriorityScore(hospital, keywords) + ((hospital.matchedKeywords?.length || 0) * 12),
      }));

      const shortlistedHospitals = sortByTravelOnly
        ? uniqueHospitals.slice(0, 30)
        : uniqueHospitals
          .sort((left, right) => {
            if (left.priorityScore !== right.priorityScore) {
              return right.priorityScore - left.priorityScore;
            }

            return (right.rating || 0) - (left.rating || 0);
          })
          .slice(0, 20);

      if (!shortlistedHospitals.length) {
        setRecommendedHospitals([]);
        if (mapManagerRef.current) {
          mapManagerRef.current.clearRecommendationMarkers();
        }
        setSelectedKeywords(keywords);
        if (!suppressToasts) showToast("No suitable hospitals were found within 5 km.", "warning");
        return [];
      }

      const distanceMatrixResponse = await getTravelTimes(searchOrigin, shortlistedHospitals);
      const elements = distanceMatrixResponse.rows?.[0]?.elements || [];

      const enrichedHospitals = shortlistedHospitals
        .map((hospital, index) => {
          const travelData = elements[index];

          if (!travelData || travelData.status !== "OK") {
            return null;
          }

          return {
            ...hospital,
            distance: travelData.distance?.text || "Distance unavailable",
            distanceValue: travelData.distance?.value ?? Number.MAX_SAFE_INTEGER,
            duration: travelData.duration?.text || "Travel time unavailable",
            durationValue: travelData.duration?.value ?? Number.MAX_SAFE_INTEGER,
            priorityScore: hospital.priorityScore,
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (left.durationValue !== right.durationValue) {
            return left.durationValue - right.durationValue;
          }

          if (sortByTravelOnly) {
            return (right.rating || 0) - (left.rating || 0);
          }

          if (left.priorityScore !== right.priorityScore) {
            return right.priorityScore - left.priorityScore;
          }

          return (right.rating || 0) - (left.rating || 0);
        })
        .slice(0, 7);

      setRecommendedHospitals(enrichedHospitals);
      setSelectedKeywords(keywords);

      if (mapManagerRef.current) {
        mapManagerRef.current.showRecommendationMarkers(enrichedHospitals);
      }

      if (enrichedHospitals.length) {
        if (!suppressToasts) {
          showToast(`Found ${enrichedHospitals.length} nearby hospitals ranked by travel time.`, "success");
        }
      } else {
        if (!suppressToasts) {
          showToast("Nearby hospitals were found, but travel time could not be calculated.", "warning");
        }
      }

      return enrichedHospitals;
    } catch (err) {
      console.error(err);
      if (!suppressToasts) showToast(err.message || "Failed to fetch AI recommended hospitals.", "error");
      return [];
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleFetchRecommendedHospitals = async () => {
    await fetchRecommendedHospitals();
  };

  useEffect(() => {
    const voiceState = routerLocation.state;

    if (!voiceState?.voiceEmergency || !voiceState?.autoBook || voiceAutoRunRef.current) {
      return;
    }

    voiceAutoRunRef.current = true;

    const runVoiceEmergencyAutoBooking = async () => {
      const resolvedEmergencyType = getEmergencyTypeKey(voiceState.emergencyType || "General Visit");
      const resolvedSituation = getSituationValue(
        resolvedEmergencyType,
        voiceState.situation || "Routine Consultation"
      );

      setEmergencyType(resolvedEmergencyType);
      setSituation(resolvedSituation);

      speak("Finding the nearest multi specialty hospital.");
      if (showToast) {
        showToast("Voice emergency detected. Finding nearest hospital...", "info");
      }

      try {
        const hospitals = await fetchRecommendedHospitals({
          selectedEmergencyType: resolvedEmergencyType,
          selectedSituation: resolvedSituation,
          customKeywords: VOICE_MULTI_SPECIALTY_KEYWORDS,
          sortByTravelOnly: true,
          suppressToasts: true,
        });

        const bestHospital = hospitals[0];

        if (!bestHospital) {
          throw new Error("No suitable hospital found for voice emergency.");
        }

        handleRecommendedHospitalSelect(bestHospital);

        const pickupCoords = await ensurePickupCoordinates();

        if (!pickupCoords) {
          throw new Error("Unable to determine pickup location.");
        }

        setBookingStatus("searching");
        setSearchingTime(0);

        const destinationHospital = `${bestHospital.name}${
          bestHospital.address ? `, ${bestHospital.address}` : ""
        }`;

        const bookingData = {
          pickup: pickup || "Current Location",
          destination: destinationHospital,
          pickupLat: pickupCoords.lat,
          pickupLng: pickupCoords.lng,
          destLat: bestHospital.location.lat,
          destLng: bestHospital.location.lng,
          emergencyType: EMERGENCY_OPTIONS[resolvedEmergencyType]?.label || resolvedEmergencyType,
          situation: resolvedSituation,
          voiceTrigger: true,
        };

        const data = await createBooking(bookingData);
        setCurrentBooking(data.booking);

        if (showToast) {
          showToast(`Ambulance booked to ${bestHospital.name}.`, "success");
        }
        speak(`Nearest multi specialty hospital found: ${bestHospital.name}. Ambulance is on the way.`);
      } catch (error) {
        console.error(error);
        setBookingStatus(null);
        if (showToast) {
          showToast(error.message || "Voice emergency booking failed.", "error");
        }
        speak("I could not complete ambulance booking. Please try again.");
      } finally {
        navigate("/bookAmbulance", { replace: true, state: {} });
      }
    };

    runVoiceEmergencyAutoBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  // Handle cancel booking
  const handleCancelBooking = async () => {
    if (!currentBooking?._id) {
      showToast("❌ No active booking to cancel", "error");
      return;
    }

    setIsCancelling(true);
    try {
      await cancelBooking(currentBooking._id);
      showToast("✅ Booking cancelled successfully", "success");
      setBookingStatus(null);
      setCurrentBooking(null);
      setSearchingTime(0);
      setDriver(null);
      setIsTracking(false);
      stopUserLocationSharing();
    } catch (err) {
      console.error("Cancel booking error:", err);
      showToast("❌ " + err.message, "error");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="ambulance-page">
      <div className="map-side">
        <div ref={mapRef} className="map-box" />
      </div>
      
      <div className="form-side">
        <h2>Book Your Ambulance</h2>

        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-btn ${locationMode === "auto" ? "active" : ""}`}
            onClick={() => toggleLocationMode("auto")}
          >
            Your current location
          </button>
          <button
            type="button"
            className={`mode-btn ${locationMode === "manual" ? "active" : ""}`}
            onClick={() => toggleLocationMode("manual")}
          >
            Enter location manually
          </button>
        </div>

        {locationMode === "manual" && (
          <div className="manual-location-box">
            <label>Pickup Location</label>
            <input
              id="manual-location-input"
              type="text"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Enter pickup location"
            />
          </div>
        )}

        <div className="destination-box">
          <label>Emergency Type</label>
          <select
            className="hospital-select"
            value={emergencyType}
            onChange={handleEmergencyChange}
          >
            <option value="">Select Emergency Type</option>
            <option value="accident">Accident</option>
            <option value="health">Health Emergency</option>
            <option value="general">General Visit</option>
          </select>
        </div>

        {emergencyType && (
          <div className="destination-box">
            <label>Situation</label>
            <select
              className="hospital-select"
              value={situation}
              onChange={handleSituationChange}
            >
              <option value="">Select Situation</option>
              {situationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="destination-box">
          <label>Destination Hospital</label>
          <input
            id="destination-input"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="🔍 Search hospital..."
          />
        </div>

        <div className="recommend-actions">
          <button
            type="button"
            className="recommend-btn"
            onClick={handleFetchRecommendedHospitals}
            disabled={isLoadingRecommendations || !emergencyType || !situation}
          >
            {isLoadingRecommendations ? "Finding hospitals..." : "AI Recommended Hospitals"}
          </button>
          {!!selectedKeywords.length && (
            <p className="recommend-keywords">
              Search focus: {selectedKeywords.join(" • ")}
            </p>
          )}
        </div>

        {(recommendedHospitals.length > 0 || (!isLoadingRecommendations && selectedKeywords.length > 0)) && (
          <div className="recommend-panel">
            <div className="recommend-panel-header">
              <h3>Recommended Hospitals</h3>
              <p>Top nearby hospitals ranked by estimated driving time.</p>
            </div>

            {recommendedHospitals.length > 0 ? (
              <div className="recommend-list">
                {recommendedHospitals.map((hospital, index) => (
                  <article key={hospital.place_id} className="recommend-card">
                    <div className="recommend-card-top">
                      <div>
                        <h4>{hospital.name}</h4>
                        {hospital.address && <p>{hospital.address}</p>}
                      </div>
                      {index === 0 && <span className="fastest-badge">AI Recommended 🚑 Fastest</span>}
                    </div>

                    <div className="recommend-meta">
                      <span>Distance: {hospital.distance}</span>
                      <span>Travel Time: {hospital.duration}</span>
                      <span>Rating: {hospital.rating ?? "N/A"}</span>
                    </div>

                    <button
                      type="button"
                      className="select-hospital-btn"
                      onClick={() => handleRecommendedHospitalSelect(hospital)}
                    >
                      Select Hospital
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="recommend-empty">
                <p>No ranked hospitals are available for the current filters.</p>
              </div>
            )}
          </div>
        )}

        <div className="tip-box">
          💡 <strong>Tip:</strong> Click on the map to set pickup or destination points directly.
        </div>

        <button onClick={handleSubmit} className="book-btn" disabled={bookingStatus === "searching"}>
          {bookingStatus === "searching" ? "Searching..." : "Book now"}
        </button>
      </div>

      {/* Booking Status Overlays */}
      {bookingStatus === "searching" && (
        <SearchingOverlay 
          searchingTime={searchingTime} 
          maxSearchTime={SEARCH_TIMEOUT_SECONDS}
          onCancel={handleCancelBooking}
          isCancelling={isCancelling}
        />
      )}

      {bookingStatus === "timeout" && (
        <SearchingOverlay 
          searchingTime={searchingTime} 
          maxSearchTime={SEARCH_TIMEOUT_SECONDS}
          isTimeout={true}
          onRetry={() => {
            setBookingStatus(null);
            setSearchingTime(0);
            setCurrentBooking(null);
          }}
        />
      )}

      {bookingStatus === "accepted" && driver && (
        <DriverPanel 
          driver={driver}
          estimatedTime={estimatedTime}
          driverLocation={driverLocation}
          userLocation={userLocation}
          isTracking={isTracking}
          onCancel={handleCancelBooking}
          isCancelling={isCancelling}
        />
      )}
    </div>
  );
}

export default BookAmbulance;