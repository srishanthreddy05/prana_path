// Booking status components
import React from "react";

export const SearchingOverlay = ({ searchingTime, maxSearchTime = 90, isTimeout = false, onRetry, onCancel, isCancelling = false }) => {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage for search progress bar
  const progressPercentage = Math.min((searchingTime / maxSearchTime) * 100, 100);

  // Show timeout state
  if (isTimeout) {
    return (
      <div className="search-overlay">
        <div className="search-card timeout-card">
          <div className="search-emoji">😔</div>
          <h2 className="search-title">No Drivers Available</h2>
          <p className="search-subtitle">
            All our ambulance drivers are currently busy attending to other emergencies.
          </p>
          <div className="timeout-info-box">
            <p className="timeout-info-text">
              We apologize for the inconvenience. Please try again in a few minutes.
            </p>
          </div>
          <div className="timeout-actions">
            <button className="retry-btn" onClick={onRetry}>
              🔄 Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-overlay">
      <div className="search-card">
        <div className="search-emoji">🔍</div>
        <h2 className="search-title">Searching for Ambulance</h2>
        <p className="search-subtitle">Finding the nearest available ambulance near you...</p>
        <div className="search-time-box">
          <p className="search-time-text">Search time: {formatTime(searchingTime)}</p>
          <div className="search-progress-bar">
            <div 
              className="search-progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
        <div className="search-wait">
          <div className="spinner"></div>
          <span className="search-wait-text">Please wait...</span>
        </div>
        {onCancel && (
          <button 
            className="cancel-search-btn" 
            onClick={onCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling..." : "✕ Cancel Request"}
          </button>
        )}
      </div>
    </div>
  );
};

export const DriverPanel = ({ driver, estimatedTime, driverLocation, userLocation, isTracking, onCancel, isCancelling = false }) => {
  return (
    <div className="driver-panel">
      <div className="driver-header">
        <div className="driver-emoji">🚑</div>
        <div>
          <h3 className="driver-title">Ambulance Found!</h3>
          <p className="driver-subtitle">Driver: {driver.username}</p>
        </div>
      </div>
      <div className="driver-eta-box">
        <p className="driver-eta-text">ETA: {estimatedTime} minutes</p>
      </div>
      {onCancel && (
        <button 
          className="cancel-booking-btn" 
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? "Cancelling..." : "Cancel Booking"}
        </button>
      )}
      
      {/* Real-time location info */}
      <div className="location-info">
        {driverLocation && (
          <div style={{ backgroundColor: "#e3f2fd", padding: "8px", borderRadius: "4px", margin: "8px 0" }}>
            <p style={{ margin: 0, fontSize: "14px", color: "#1565c0" }}>
              <strong>🚗 Driver Location:</strong><br/>
              {driverLocation.lat.toFixed(6)}, {driverLocation.lng.toFixed(6)}
            </p>
          </div>
        )}
        
        {userLocation && (
          <div style={{ backgroundColor: "#f3e5f5", padding: "8px", borderRadius: "4px", margin: "8px 0" }}>
            <p style={{ margin: 0, fontSize: "14px", color: "#7b1fa2" }}>
              <strong>📍 Your Location:</strong><br/>
              {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
              <br/>
              <small>Sharing location with driver</small>
            </p>
          </div>
        )}
      </div>
      
      <p className="driver-tracking-text">
        {isTracking ? "🔄 Real-time tracking active" : "Driver is on the way!"}
      </p>
    </div>
  );
};
