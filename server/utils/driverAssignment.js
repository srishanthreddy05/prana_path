/**
 * Smart Driver Assignment Service
 * Finds and assigns best drivers based on:
 * 1. Distance (nearest drivers)
 * 2. ETA to pickup location
 * 3. Current availability/load
 * 4. Traffic conditions
 */

const { predictETA, calculateDistance } = require("./etaPrediction");

/**
 * Find nearby drivers within a specified radius
 * @param {Array} allDrivers - Array of driver objects with location
 * @param {number} pickupLat - Patient pickup latitude
 * @param {number} pickupLng - Patient pickup longitude
 * @param {number} radiusKm - Search radius in kilometers (default 5 km)
 * @returns {Array} Sorted array of nearby drivers with distance and ETA
 */
const findNearbyDrivers = (allDrivers, pickupLat, pickupLng, radiusKm = 5) => {
  if (!allDrivers || allDrivers.length === 0) return [];

  const nearbyDrivers = allDrivers
    .map((driver) => {
      if (!driver.onDuty) {
        return null;
      }

      // Check if driver has current location
      if (!driver.currentLocation || !driver.currentLocation.lat || !driver.currentLocation.lng) {
        return null;
      }

      const distance = calculateDistance(
        driver.currentLocation.lat,
        driver.currentLocation.lng,
        pickupLat,
        pickupLng
      );

      // Only include drivers within the specified radius
      if (distance > radiusKm) return null;

      const eta = predictETA(
        driver.currentLocation.lat,
        driver.currentLocation.lng,
        pickupLat,
        pickupLng
      );

      return {
        driverId: driver._id,
        driverName: driver.username,
        distance, // in km
        eta, // in minutes
        currentLoad: driver.currentLoad || 0, // Number of active bookings
        rating: driver.rating || 4.5,
        isAvailable: driver.onDuty && driver.currentLoad === 0,
      };
    })
    .filter((driver) => driver !== null); // Remove null entries

  return nearbyDrivers;
};

/**
 * Calculate a score for each driver based on multiple factors
 * Lower score = better candidate
 * Formula: (distance * 0.4) + (eta * 0.3) + (currentLoad * 5) - (rating * 0.5)
 * 
 * @param {Object} driver - Driver object with distance, eta, currentLoad, rating
 * @returns {number} Composite score
 */
const calculateDriverScore = (driver) => {
  const distanceScore = driver.distance * 0.4; // Prefer closer drivers
  const etaScore = driver.eta * 0.3; // Prefer lower ETA
  const loadScore = driver.currentLoad * 5; // Penalize busy drivers
  const ratingScore = driver.rating * 0.5; // Prefer higher rated drivers
  const availabilityScore = driver.isAvailable ? 0 : 10; // Penalize unavailable drivers

  const totalScore =
    distanceScore + etaScore + loadScore - ratingScore + availabilityScore;

  return totalScore;
};

/**
 * Get the best drivers for a booking
 * @param {Array} nearbyDrivers - Array of nearby drivers
 * @param {number} topCount - Number of best drivers to return (default 3)
 * @returns {Array} Top N drivers sorted by score (best first)
 */
const getBestDrivers = (nearbyDrivers, topCount = 3) => {
  if (!nearbyDrivers || nearbyDrivers.length === 0) return [];

  const scoredDrivers = nearbyDrivers.map((driver) => ({
    ...driver,
    score: calculateDriverScore(driver),
  }));

  // Sort by score (ascending - lower is better)
  return scoredDrivers.sort((a, b) => a.score - b.score).slice(0, topCount);
};

/**
 * Find and get the single best driver for a booking
 * @param {Array} allDrivers - All available drivers
 * @param {number} pickupLat
 * @param {number} pickupLng
 * @param {number} radiusKm - Search radius (default 5 km)
 * @returns {Object|null} Best driver object or null
 */
const getBestDriver = (allDrivers, pickupLat, pickupLng, radiusKm = 5) => {
  const nearbyDrivers = findNearbyDrivers(allDrivers, pickupLat, pickupLng, radiusKm);
  const bestDrivers = getBestDrivers(nearbyDrivers, 1);
  
  return bestDrivers.length > 0 ? bestDrivers[0] : null;
};

/**
 * Calculate assignment metrics for a driver and booking
 * @param {Object} driver - Driver object
 * @param {Object} booking - Booking object
 * @returns {Object} Metrics including scores and ETAs
 */
const calculateAssignmentMetrics = (driver, booking) => {
  const etaToPickup = predictETA(
    driver.currentLocation.lat,
    driver.currentLocation.lng,
    booking.pickupLat,
    booking.pickupLng
  );

  const etaToDestination = predictETA(
    booking.pickupLat,
    booking.pickupLng,
    booking.destLat,
    booking.destLng
  );

  const distance = calculateDistance(
    driver.currentLocation.lat,
    driver.currentLocation.lng,
    booking.pickupLat,
    booking.pickupLng
  );

  return {
    driverId: driver._id,
    etaToPickup,
    etaToDestination,
    totalEta: etaToPickup + etaToDestination,
    distance,
    currentLoad: driver.currentLoad || 0,
    rating: driver.rating || 4.5,
  };
};

module.exports = {
  findNearbyDrivers,
  calculateDriverScore,
  getBestDrivers,
  getBestDriver,
  calculateAssignmentMetrics,
};
