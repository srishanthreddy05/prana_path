const polyline = require("@mapbox/polyline");
const { getAllUsers } = require("../models/User");
const { updateBooking } = require("../models/Booking");
const { distancePointToSegment } = require("../utils/geoUtils");

async function notifyPoliceIfRoutePasses(booking, encodedPolyline, io) {
  if (!encodedPolyline || !io) return;

  // Decode route polyline
  const routePoints = polyline
    .decode(encodedPolyline)
    .map(([lat, lng]) => ({ lat, lng }));

  // Fetch all users and filter for police with saved locations
  const allUsers = await getAllUsers();
  const policeUsers = allUsers.filter(
    (u) =>
      u.role === "police" &&
      u.currentLocation &&
      typeof u.currentLocation.lat === "number" &&
      typeof u.currentLocation.lng === "number"
  );

  for (const police of policeUsers) {
    const { lat, lng } = police.currentLocation;
    const radius = 150; // meters
    let minDistance = Infinity;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const d = distancePointToSegment(
        { lat, lng },
        routePoints[i],
        routePoints[i + 1]
      );
      if (d < minDistance) minDistance = d;
    }

    console.log(`Police ${police.uid} → minDistance = ${minDistance.toFixed(2)} m`);

    if (minDistance <= radius) {
      console.log(`🚨 NOTIFY police ${police.uid}`);

      // Add police uid to alertedPolice map in booking
      const alertedPolice = booking.alertedPolice || {};
      alertedPolice[police.uid] = true;
      await updateBooking(booking.id, { alertedPolice });

      io.to(`police:${police.uid}`).emit("police:ambulance-alert", {
        bookingId: booking.id,
        distance: Math.round(minDistance),
        message: "🚑 Ambulance route passes near your location",
      });
    } else {
      console.log(`❌ Police ${police.uid} is NOT on route`);
    }
  }
}

module.exports = { notifyPoliceIfRoutePasses };
