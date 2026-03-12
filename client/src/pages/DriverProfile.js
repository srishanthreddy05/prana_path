import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../utils/api";
import "../styles/DriverProfile.css";

const placeholderAvatar = "https://via.placeholder.com/160x160.png?text=Driver";

function DriverProfile({ showToast }) {
  const [form, setForm] = useState({
    displayName: "",
    dob: "",
    area: "",
    pincode: "",
    mobile: "",
    vehicleNumber: "",
    profilePhoto: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/users/profile");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load profile");

      setForm({
        displayName: data.displayName || "",
        dob: data.dob ? data.dob.slice(0, 10) : "",
        area: data.area || "",
        pincode: data.pincode || "",
        mobile: data.mobile || "",
        vehicleNumber: data.vehicleNumber || "",
        profilePhoto: data.profilePhoto || "",
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
      displayName: form.displayName,
      dob: form.dob || undefined,
      area: form.area,
      pincode: form.pincode,
      mobile: form.mobile,
      vehicleNumber: form.vehicleNumber,
      profilePhoto: form.profilePhoto,
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
        displayName: updatedUser.displayName ?? prev.displayName,
        dob: updatedUser.dob ? updatedUser.dob.slice(0, 10) : prev.dob,
        area: updatedUser.area ?? prev.area,
        pincode: updatedUser.pincode ?? prev.pincode,
        mobile: updatedUser.mobile ?? prev.mobile,
        vehicleNumber: updatedUser.vehicleNumber ?? prev.vehicleNumber,
        profilePhoto: updatedUser.profilePhoto ?? prev.profilePhoto,
      }));
      if (showToast) showToast("Profile updated.", "success");
    } catch (err) {
      setError(err.message);
      if (showToast) showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="police-profile-page">
      <div className="profile-header">
        <div>
          <h2>Driver Profile</h2>
          <p>Update your details used for dispatch and verification.</p>
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
              <label>Name</label>
              <input
                name="displayName"
                value={form.displayName}
                onChange={handleInputChange}
                placeholder="e.g., S. Kumar"
              />
            </div>
            <div className="form-row">
              <label>Mobile Number</label>
              <input
                name="mobile"
                value={form.mobile}
                onChange={handleInputChange}
                placeholder="e.g., 9876543210"
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
            <div className="form-row grid-2">
              <div>
                <label>Area</label>
                <input
                  name="area"
                  value={form.area}
                  onChange={handleInputChange}
                  placeholder="Service area"
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

            <div className="form-row">
              <label>Vehicle Number</label>
              <input
                name="vehicleNumber"
                value={form.vehicleNumber}
                onChange={handleInputChange}
                placeholder="e.g., TS09 AB 1234"
              />
            </div>

            <button className="save-btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      {loading && <div className="loading-bar">Loading profile...</div>}
    </div>
  );
}

export default DriverProfile;
