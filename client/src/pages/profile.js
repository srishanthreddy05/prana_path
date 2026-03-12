import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PopupModal from "../components/PopupModal";
import { authFetch } from "../utils/api";

function UserProfile({ showToast }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
    // Show popup if redirected from Book Now due to incomplete profile
    useEffect(() => {
      if (location.state && location.state.requireProfileCompletion) {
        setShowProfilePopup(true);
        // Clean up state so popup doesn't show on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    }, [location, navigate]);
  const [form, setForm] = useState({
    displayName: "",
    mobile: "",
    dob: "",
    bloodGroup: "",
    area: "",
    pincode: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState({
    displayName: "",
    mobile: "",
    dob: "",
    bloodGroup: "",
    area: "",
    pincode: "",
  });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/users/profile");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load profile");

      setForm({
        displayName: data.displayName || "",
        mobile: data.mobile || "",
        dob: data.dob ? data.dob.slice(0, 10) : "",
        bloodGroup: data.bloodGroup || "",
        area: data.area || "",
        pincode: data.pincode || "",
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

    // Inline validation
    setValidation((prev) => {
      const v = { ...prev };
      if (name === "mobile") {
        if (!/^\d{10}$/.test(value)) v.mobile = "Mobile must be 10 digits"; else v.mobile = "";
      }
      if (name === "pincode") {
        if (!/^\d{6}$/.test(value)) v.pincode = "Pincode must be 6 digits"; else v.pincode = "";
      }
      if (name === "bloodGroup") {
        if (!value) v.bloodGroup = "Please select a blood group"; else v.bloodGroup = "";
      }
      if (name === "dob") {
        const d = value ? new Date(value) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date()) v.dob = "Enter a valid past date"; else v.dob = "";
      }
      if (name === "area") {
        v.area = value.trim() ? "" : "Area is required";
      }
      if (name === "displayName") {
        v.displayName = value.trim() ? "" : "Name is required";
      }
      return v;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      displayName: form.displayName,
      mobile: form.mobile,
      dob: form.dob || undefined,
      bloodGroup: form.bloodGroup,
      area: form.area,
      pincode: form.pincode,
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
        mobile: updatedUser.mobile ?? prev.mobile,
        dob: updatedUser.dob ? updatedUser.dob.slice(0, 10) : prev.dob,
        bloodGroup: updatedUser.bloodGroup ?? prev.bloodGroup,
        area: updatedUser.area ?? prev.area,
        pincode: updatedUser.pincode ?? prev.pincode,
      }));
      if (showToast) showToast("Profile updated.", "success");
    } catch (err) {
      setError(err.message);
      if (showToast) showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const allValid =
    form.displayName.trim() &&
    /^\d{10}$/.test(form.mobile) &&
    form.dob && !validation.dob &&
    !!form.bloodGroup &&
    form.area.trim() &&
    /^\d{6}$/.test(form.pincode);

  return (
    <div className="police-profile-page">
      <PopupModal
        open={showProfilePopup}
        message="Please fill your details to continue booking."
        onClose={() => setShowProfilePopup(false)}
      />
      <div className="profile-header">
        <div>
          <p>Update your personal details for better service.</p>
        </div>
        <button className="refresh-btn" onClick={fetchProfile} disabled={loading}>
          <i className="bi bi-arrow-clockwise"></i> Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      <div className="profile-grid">
        <div className="profile-card">
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Name</label>
              <input
                name="displayName"
                value={form.displayName}
                onChange={handleInputChange}
                placeholder="e.g., John Doe"
              />
              {validation.displayName && <small className="text-danger">{validation.displayName}</small>}
            </div>
            <div className="form-row">
              <label>Mobile Number</label>
              <input
                name="mobile"
                value={form.mobile}
                onChange={handleInputChange}
                placeholder="e.g., 9876543210"
              />
              {validation.mobile && <small className="text-danger">{validation.mobile}</small>}
            </div>
            <div className="form-row">
              <label>Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleInputChange}
              />
              {validation.dob && <small className="text-danger">{validation.dob}</small>}
            </div>
            <div className="form-row">
              <label>Blood Group</label>
              <select
                name="bloodGroup"
                value={form.bloodGroup}
                onChange={handleInputChange}
              >
                <option value="">Select Blood Group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
              {validation.bloodGroup && <small className="text-danger">{validation.bloodGroup}</small>}
            </div>
            <div className="form-row grid-2">
              <div>
                <label>Area</label>
                <input
                  name="area"
                  value={form.area}
                  onChange={handleInputChange}
                  placeholder="Your area"
                />
                {validation.area && <small className="text-danger">{validation.area}</small>}
              </div>
              <div>
                <label>Pincode</label>
                <input
                  name="pincode"
                  value={form.pincode}
                  onChange={handleInputChange}
                  placeholder="e.g., 500001"
                />
                {validation.pincode && <small className="text-danger">{validation.pincode}</small>}
              </div>
            </div>

            <button className="save-btn" type="submit" disabled={saving || !allValid}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      {loading && <div className="loading-bar">Loading profile...</div>}
    </div>
  );
}

export default UserProfile;
