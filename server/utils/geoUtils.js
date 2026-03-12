function distanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ✅ NEW – precise distance to ROAD SEGMENT
function distancePointToSegment(p, v, w) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(v.lat);
  const lng1 = toRad(v.lng);
  const lat2 = toRad(w.lat);
  const lng2 = toRad(w.lng);
  const lat3 = toRad(p.lat);
  const lng3 = toRad(p.lng);

  const dx = lng2 - lng1;
  const dy = lat2 - lat1;

  if (dx === 0 && dy === 0) {
    return distanceInMeters(p.lat, p.lng, v.lat, v.lng);
  }

  const t =
    ((lng3 - lng1) * dx + (lat3 - lat1) * dy) /
    (dx * dx + dy * dy);

  const tClamped = Math.max(0, Math.min(1, t));

  const proj = {
    lat: toDeg(lat1 + tClamped * dy),
    lng: toDeg(lng1 + tClamped * dx),
  };

  return distanceInMeters(p.lat, p.lng, proj.lat, proj.lng);
}

module.exports = {
  distanceInMeters,
  distancePointToSegment,
};
