/**
 * Traffic Alert Service
 * - Alerts traffic volunteers (within 800 m of route) to help clear the road.
 * - Sends public-awareness notifications to regular users within 100 m of the route.
 */

const polyline = require("@mapbox/polyline");
const { getAllUsers } = require("../models/User");
const { distancePointToSegment } = require("../utils/geoUtils");

const TRAFFIC_VOLUNTEER_RADIUS_METERS = 800;
const PUBLIC_AWARENESS_RADIUS_METERS = 100;

/**
 * Compute the minimum perpendicular distance (meters) from a point to a polyline.
 */
function minDistanceToPolyline(point, routePoints) {
  let min = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const d = distancePointToSegment(point, routePoints[i], routePoints[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Alert traffic volunteers near the ambulance route and send public-awareness
 * notifications to regular users very close to the route.
 *
 * @param {Object} booking  - Booking object (must have .id)
 * @param {string} encodedPolyline - Google-encoded overview polyline
 * @param {Object} io       - Socket.IO server instance
 */
async function alertVolunteersAndPublicOnRoute(booking, encodedPolyline, io) {
  if (!encodedPolyline || !io) return;

  const routePoints = polyline
    .decode(encodedPolyline)
    .map(([lat, lng]) => ({ lat, lng }));

  if (routePoints.length < 2) return;

  const allUsers = await getAllUsers();

  for (const user of allUsers) {
    if (
      !user.currentLocation ||
      typeof user.currentLocation.lat !== "number" ||
      typeof user.currentLocation.lng !== "number"
    ) {
      continue;
    }

    const point = { lat: user.currentLocation.lat, lng: user.currentLocation.lng };
    const dist = minDistanceToPolyline(point, routePoints);

    const isTrafficVol =
      user.volunteerRole === "traffic_volunteer" && user.volunteerActive === true;
    const isRegularUser = user.role === "user";

    if (isTrafficVol && dist <= TRAFFIC_VOLUNTEER_RADIUS_METERS) {
      io.to(`user:${user.uid}`).emit("traffic:roadAlert", {
        bookingId: booking.id,
        distance: Math.round(dist),
        message: "🚑 Ambulance approaching. Please help clear the road.",
      });
      console.log(`🚦 Traffic volunteer ${user.uid} alerted (${Math.round(dist)} m from route)`);
    } else if (isRegularUser && dist <= PUBLIC_AWARENESS_RADIUS_METERS) {
      io.to(`user:${user.uid}`).emit("public:emergencyAlert", {
        bookingId: booking.id,
        distance: Math.round(dist),
        message: "🚑 Emergency vehicle approaching. Please give way.",
      });
    }
  }
}

/**
 * Alert traffic volunteers near a specific lat/lng point (driver-requested).
 * Used by the "Request Traffic Volunteers" button in the driver dashboard.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} bookingId
 * @param {Object} io
 * @param {Function} distanceFn - distanceInMeters utility
 * @returns {number} count of volunteers alerted
 */
async function alertNearbyTrafficVolunteers(lat, lng, bookingId, io, distanceFn) {
  const allUsers = await getAllUsers();
  let count = 0;

  for (const user of allUsers) {
    if (user.volunteerRole !== "traffic_volunteer" || !user.volunteerActive) continue;
    if (!user.currentLocation?.lat || !user.currentLocation?.lng) continue;

    const dist = distanceFn(lat, lng, user.currentLocation.lat, user.currentLocation.lng);
    if (dist <= 800) {
      io.to(`user:${user.uid}`).emit("traffic:roadAlert", {
        bookingId,
        distance: Math.round(dist),
        message: "🚑 Ambulance nearby needs help clearing traffic.",
      });
      count++;
    }
  }

  return count;
}

module.exports = { alertVolunteersAndPublicOnRoute, alertNearbyTrafficVolunteers };
