const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

// Words in a place name that disqualify it from being a true hospital.
// Matched against the lowercased name.
const EXCLUDE_NAME_FRAGMENTS = [
  "medical store",
  "pharmacy",
  "pharma",
  "clinic",
  "diagnostics",
  "diagnostic",
  " lab",
  "laboratory",
  "nursing home",    // keep only if also has "hospital" in types, handled below
  "dispensary",
  "drug store",
  "chemist",
  "optical",
  "dental",
  "eye care",
  "ayurvedic",
  "homeopathic",
  "pathology",
  "blood bank",
  "health center",   // ambiguous — excluded to be safe
];

/**
 * Returns true if the Google Place result is a genuine hospital.
 * Rules:
 *  1. place.types must contain "hospital"
 *  2. place.name (lowercased) must NOT contain any excluded fragment
 */
function isRealHospital(place) {
  const types = place.types || [];
  if (!types.includes("hospital")) return false;

  const nameLower = (place.name || "").toLowerCase();
  return !EXCLUDE_NAME_FRAGMENTS.some((fragment) => nameLower.includes(fragment));
}

// GET /api/hospitals/nearest?lat=&lng=
router.get("/nearest", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: "lat and lng query params are required" });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return res.status(400).json({ message: "lat and lng must be valid numbers" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Google Maps API key not configured" });
  }

  try {
    // 1. Google Places Nearby Search
    //    - radius=5000 (5 km) with keyword+type gives better precision than rankby=distance
    //    - keyword=hospital further narrows results to genuine hospitals
    const nearbyUrl =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${parsedLat},${parsedLng}` +
      `&radius=5000` +
      `&type=hospital` +
      `&keyword=hospital` +
      `&key=${apiKey}`;

    const nearbyRes = await fetch(nearbyUrl);
    const nearbyData = await nearbyRes.json();

    if (!nearbyData.results || nearbyData.results.length === 0) {
      return res.json({ hospitals: [] });
    }

    // 2. Filter: keep only genuine hospitals (type check + name blocklist)
    const filtered = nearbyData.results.filter(isRealHospital);

    if (filtered.length === 0) {
      return res.json({ hospitals: [] });
    }

    // Take up to 15 filtered candidates for the Distance Matrix call
    const candidates = filtered.slice(0, 15);

    // 3. Google Distance Matrix — driving mode (batch all destinations in one call)
    const destinations = candidates
      .map((p) => `${p.geometry.location.lat},${p.geometry.location.lng}`)
      .join("|");

    const matrixUrl =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${parsedLat},${parsedLng}` +
      `&destinations=${encodeURIComponent(destinations)}` +
      `&mode=driving` +
      `&key=${apiKey}`;

    const matrixRes = await fetch(matrixUrl);
    const matrixData = await matrixRes.json();

    const elements = matrixData.rows?.[0]?.elements || [];

    // 4. Combine, drop unreachable results, sort by driving duration, return top 7
    const hospitals = candidates
      .map((place, i) => {
        const el = elements[i];
        if (!el || el.status !== "OK") return null;
        return {
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          distance: el.distance.text,
          duration: el.duration.text,
          durationValue: el.duration.value, // seconds — used for sorting only
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.durationValue - b.durationValue)
      .slice(0, 7)
      .map(({ durationValue, ...rest }) => rest); // strip internal sort field

    return res.json({ hospitals });
  } catch (err) {
    console.error("Nearest hospitals error:", err);
    return res.status(500).json({ message: "Failed to fetch nearby hospitals" });
  }
});

module.exports = router;
