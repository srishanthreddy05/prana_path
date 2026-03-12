const fetch = require("node-fetch");

async function getRoute(pickupLat, pickupLng, destLat, destLng) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLat},${pickupLng}&destination=${destLat},${destLng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  const hasRoute = Array.isArray(data.routes) && data.routes.length > 0;
  if (!hasRoute) {
    const status = data?.status || "UNKNOWN_STATUS";
    const errorMessage = data?.error_message ? ` (${data.error_message})` : "";
    console.warn(
      `⚠️ Google Directions: No route found [status=${status}] origin=${pickupLat},${pickupLng} destination=${destLat},${destLng}${errorMessage}`
    );
    return null;
  }

  return data.routes[0];
}

module.exports = { getRoute };
