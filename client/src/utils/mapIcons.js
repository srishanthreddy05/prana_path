// Shared map marker icons for consistent appearance across the application

// Ambulance Icon SVG - Blue ambulance with medical cross
export const getAmbulanceSvg = () => `
  <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
    <defs>
      <filter id="ambulanceShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="25" cy="25" r="23" fill="#2196F3" filter="url(#ambulanceShadow)"/>
    <circle cx="25" cy="25" r="20" fill="white"/>
    <rect x="12" y="18" width="26" height="15" rx="3" fill="#2196F3"/>
    <rect x="30" y="14" width="8" height="8" rx="2" fill="#2196F3"/>
    <circle cx="17" cy="35" r="3" fill="#333"/>
    <circle cx="33" cy="35" r="3" fill="#333"/>
    <rect x="18" y="21" width="2" height="8" fill="white"/>
    <rect x="15" y="24" width="8" height="2" fill="white"/>
    <rect x="32" y="16" width="4" height="4" fill="#87CEEB"/>
  </svg>
`;

// Police Icon SVG - Police officer with cap and badge
export const getPoliceSvg = () => `
  <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
    <defs>
      <filter id="policeShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="25" cy="25" r="23" fill="#9C27B0" filter="url(#policeShadow)"/>
    <circle cx="25" cy="25" r="20" fill="white"/>
    <ellipse cx="25" cy="12" rx="10" ry="6" fill="#1a237e"/>
    <rect x="20" y="8" width="10" height="4" fill="#FFD700"/>
    <circle cx="25" cy="23" r="8" fill="#FFCCBC"/>
    <circle cx="22" cy="22" r="1.5" fill="#333"/>
    <circle cx="28" cy="22" r="1.5" fill="#333"/>
    <path d="M22 26 Q25 28 28 26" stroke="#333" stroke-width="1" fill="none"/>
    <rect x="18" y="32" width="14" height="10" rx="2" fill="#1a237e"/>
    <rect x="22" y="34" width="6" height="3" fill="#FFD700"/>
  </svg>
`;

// Get ambulance icon URL for Google Maps marker
export const getAmbulanceIconUrl = () => {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(getAmbulanceSvg());
};

// Get police icon URL for Google Maps marker
export const getPoliceIconUrl = () => {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(getPoliceSvg());
};

// Create ambulance marker icon config for Google Maps
export const getAmbulanceMarkerIcon = () => ({
  url: getAmbulanceIconUrl(),
  scaledSize: new window.google.maps.Size(50, 50),
  anchor: new window.google.maps.Point(25, 25),
});

// Create police marker icon config for Google Maps
export const getPoliceMarkerIcon = () => ({
  url: getPoliceIconUrl(),
  scaledSize: new window.google.maps.Size(50, 50),
  anchor: new window.google.maps.Point(25, 25),
});
