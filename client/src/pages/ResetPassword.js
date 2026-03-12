import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { authFetch } from "../utils/api";
import "../styles/Auth.css";

function ResetPassword() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const email = searchParams.get("email") || "";

  const handleReset = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError("");
    setInfo("");

    if (!token) {
      setError("Invalid reset link");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`/auth/reset-password/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || "Unable to reset password");
        return;
      }
      
      setInfo("Password updated. You can login now.");
      setTimeout(() => navigate("/auth"), 1500);
    } catch (err) {
      console.error("Reset password error:", err);
      setError("Server error. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card-glass">
        <div className="auth-left">
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">Enter a new password to regain access.</p>
          {email && <p className="hint">Resetting for: {email}</p>}
          {info && <p className="text-success">{info}</p>}
          {error && <p className="text-danger">{error}</p>}
        </div>
        <div className="auth-right">
          <form onSubmit={handleReset} className="auth-form">
            <h2>Create New Password</h2>
            <div className="form-group" style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
              />
              <label>New Password</label>
              <span
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  color: "#888",
                  fontSize: "1.2em"
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={0}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>
            <div className="form-group" style={{ position: "relative" }}>
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={8}
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder=" "
              />
              <label>Confirm Password</label>
              <span
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  color: "#888",
                  fontSize: "1.2em"
                }}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                tabIndex={0}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Updating..." : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
