import { useCallback, useEffect, useRef, useState } from "react";
import { indiaCenter } from "../utils/mapUtils";
import { authFetch } from "../utils/api";
import "../styles/policeProfile.css";

const placeholderAvatar = "https://via.placeholder.com/160x160.png?text=Police";

function PoliceProfile({ showToast }) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    displayName: "",
    dob: "",
    station: "",
    area: "",
    pincode: "",
    profilePhoto: "",
    currentLocation: null,
  });
  const [geoCenter, setGeoCenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const mapReadyRef = useRef(false);

  const placeMarker = useCallback((loc) => {
    if (!mapInstanceRef.current || !window.google) return;

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        title: "Current location",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          scaledSize: new window.google.maps.Size(36, 36),
        },
      });
    }

    markerRef.current.setPosition(loc);
    mapInstanceRef.current.panTo(loc);
    mapInstanceRef.current.setZoom(13);
  }, []);

  const handleMapClick = useCallback(
    (event) => {
      const loc = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      setForm((prev) => ({
        ...prev,
        currentLocation: {
          lat: loc.lat,
          lng: loc.lng,
          label:
            prev.currentLocation?.label ||
            `Pinned at ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
        },
      }));
      placeMarker(loc);
      if (showToast) showToast("Location updated on the map.", "success");
    },
    [placeMarker, showToast]
  );

  const initializeMap = useCallback(() => {
    if (mapReadyRef.current || !window.google || !mapRef.current) return;

    const center = form.currentLocation
      ? { lat: form.currentLocation.lat, lng: form.currentLocation.lng }
      : geoCenter
      ? { lat: geoCenter.lat, lng: geoCenter.lng }
      : indiaCenter;

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: form.currentLocation ? 12 : geoCenter ? 14 : 5,
      mapTypeId: "roadmap",
    });

    mapInstanceRef.current.addListener("click", handleMapClick);
    mapReadyRef.current = true;

    if (form.currentLocation) {
      placeMarker({ lat: form.currentLocation.lat, lng: form.currentLocation.lng });
    }
  }, [form.currentLocation, geoCenter, handleMapClick, placeMarker]);

  // Try to center map near the officer's live device location without persisting it as the saved location
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoCenter(loc);

        if (mapInstanceRef.current && !form.currentLocation) {
          mapInstanceRef.current.setCenter(loc);
          mapInstanceRef.current.setZoom(14);
        }
      },
      () => {
        // Silent fallback to India center if user blocks geolocation
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [form.currentLocation]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (window.google) {
        initializeMap();
        clearInterval(timer);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [initializeMap]);

  useEffect(() => {
    if (!mapReadyRef.current || !form.currentLocation) return;
    placeMarker({ lat: form.currentLocation.lat, lng: form.currentLocation.lng });
  }, [form.currentLocation, placeMarker]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/users/profile");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load profile");

      setForm({
        username: data.username || "",
        email: data.email || "",
        displayName: data.displayName || "",
        dob: data.dob ? data.dob.slice(0, 10) : "",
        station: data.station || "",
        area: data.area || "",
        pincode: data.pincode || "",
        profilePhoto: data.profilePhoto || "",
        currentLocation: data.currentLocation || null,
      });
    } catch (err) {
      setError(err.message);
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({ ...prev, profilePhoto: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      dob: form.dob || undefined,
      currentLocation: form.currentLocation || undefined,
    };

    try {
      const res = await authFetch("/users/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update profile");
      const updatedUser = data.user || {};
      setForm((prev) => ({
        ...prev,
        ...updatedUser,
        dob: updatedUser.dob ? updatedUser.dob.slice(0, 10) : prev.dob,
        currentLocation:
          updatedUser.currentLocation !== undefined
            ? updatedUser.currentLocation
            : prev.currentLocation,
        profilePhoto:
          updatedUser.profilePhoto !== undefined
            ? updatedUser.profilePhoto
            : prev.profilePhoto,
      }));
      if (showToast) showToast("Profile updated.", "success");
    } catch (err) {
      setError(err.message);
      if (showToast) showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const locationSummary = form.currentLocation
    ? `${form.currentLocation.lat.toFixed(4)}, ${form.currentLocation.lng.toFixed(4)}`
    : "Click on the map to set your location";

  return (
    <div className="police-profile-page">
      <div className="profile-header">
        <div>
          <h2>Police Profile</h2>
          <p>Update your display details and pin your current post location.</p>
        </div>
        <button className="refresh-btn" onClick={fetchProfile} disabled={loading}>
          <i className="bi bi-arrow-clockwise"></i> Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      <div className="profile-grid">
        <div className="profile-card">
          <div className="avatar-block">
            <img
              src={form.profilePhoto || placeholderAvatar}
              alt="Profile"
              className="profile-avatar"
            />
            <label className="upload-btn">
              <i className="bi bi-upload"></i> Update Photo
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Display Name</label>
              <input
                name="displayName"
                value={form.displayName}
                onChange={handleInputChange}
                placeholder="e.g., Officer Reddy"
              />
            </div>
            <div className="form-row">
              <label>Username</label>
              <input
                name="username"
                value={form.username}
                onChange={handleInputChange}
                placeholder="Username"
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInputChange}
                placeholder="name@force.in"
              />
            </div>
            <div className="form-row">
              <label>Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-row">
              <label>Station</label>
              <input
                name="station"
                value={form.station}
                onChange={handleInputChange}
                placeholder="Police station name"
              />
            </div>
            <div className="form-row grid-2">
              <div>
                <label>Area</label>
                <input
                  name="area"
                  value={form.area}
                  onChange={handleInputChange}
                  placeholder="Jurisdiction area"
                />
              </div>
              <div>
                <label>Pincode</label>
                <input
                  name="pincode"
                  value={form.pincode}
                  onChange={handleInputChange}
                  placeholder="e.g., 500001"
                />
              </div>
            </div>

            <button className="save-btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>

        <div className="map-card">
          <div className="map-header">
            <div>
              <h4 style={{ color: "white" }}>Set Current Location</h4>
              <p style={{ color: "white" }}>Click anywhere on the map to pin your current post location.</p>
            </div>
            <span className="location-chip">{locationSummary}</span>
          </div>
          <div ref={mapRef} className="profile-map" aria-label="Location selector"></div>
        </div>
      </div>

      {loading && <div className="loading-bar">Loading profile...</div>}
    </div>
  );
}

export default PoliceProfile;
