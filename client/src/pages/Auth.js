// src/pages/Auth.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { getSocket } from "../utils/socket";
import "../styles/Auth.css";

function Auth({ setIsLoggedIn, setAuthRole }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    setError("");

    if (!selectedRole) {
      setError("Please select your role before signing in.");
      return;
    }

    setLoading(true);

    try {
      // Sign in with Google popup
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Send ID token to our backend to upsert user in Firebase RTDB
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE_URL || "http://localhost:5000/api"}/auth/google`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, selectedRole }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Sign-in failed. Please try again.");
        await auth.signOut();
        return;
      }

      const { user } = data;

      // Persist session info
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("role", user.role || "user");
      localStorage.setItem("username", user.displayName || user.username || user.email);
      localStorage.setItem("userId", user.uid);
      setIsLoggedIn(true);
      if (setAuthRole) setAuthRole(user.role || "user");

      // Join user socket room if role is user
      if (user.role === "user") {
        const socket = getSocket();
        socket.emit("user:join", user.uid);
      }

      // Redirect based on role
      if (user.role === "driver") navigate("/driver");
      else if (user.role === "police") navigate("/police");
      else navigate("/");
    } catch (err) {
      console.error("Google sign-in error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed. Please try again.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError("Failed to sign in. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card-glass">
        {/* Left Panel */}
        <div className="auth-left">
          <h1 className="auth-title">PranaPath</h1>
          <p className="auth-subtitle">
            Emergency ambulance booking and tracking powered by real-time technology.
          </p>
          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <div style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "16px",
              padding: "1rem 1.5rem",
              color: "#fff",
              fontSize: "0.95rem",
              lineHeight: "1.8"
            }}>
              🚑 Book an ambulance in seconds<br />
              📍 Real-time GPS tracking<br />
              🩸 Blood donation network<br />
              👮 Police coordination
            </div>
          </div>
          {error && (
            <p className="text-danger" style={{ marginTop: "1rem", textAlign: "center" }}>
              {error}
            </p>
          )}
        </div>

        {/* Right Panel */}
        <div className="auth-right">
          <div className="auth-form" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
            <h2 style={{ marginBottom: 0 }}>Welcome</h2>
            <p style={{ color: "rgba(255,255,255,0.8)", textAlign: "center", margin: 0, fontSize: "0.95rem" }}>
              Sign in with your Google account to continue
            </p>

            <div style={{ width: "100%" }}>
              <label
                htmlFor="role"
                style={{ display: "block", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem", fontSize: "0.9rem" }}
              >
                Select your role
              </label>
              <select
                id="role"
                value={selectedRole}
                onChange={(e) => {
                  setSelectedRole(e.target.value);
                  if (error) setError("");
                }}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  outline: "none",
                }}
              >
                <option value="" style={{ color: "#222" }}>Choose role</option>
                <option value="user" style={{ color: "#222" }}>User</option>
                <option value="driver" style={{ color: "#222" }}>Driver</option>
                <option value="police" style={{ color: "#222" }}>Police</option>
              </select>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading || !selectedRole}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 2rem",
                borderRadius: "25px",
                border: "none",
                background: "#fff",
                color: "#333",
                fontWeight: "700",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                transition: "all 0.3s ease",
                width: "100%",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.transform = "scale(1.03)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {/* Google "G" SVG icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="22px" height="22px">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9L37.4 9.3C34 6.3 29.2 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c11 0 20.5-8 20.5-20.5 0-1.3-.1-2.7-.4-4z"/>
                <path fill="#FF3D00" d="M6.4 14.7l6.6 4.8C14.8 15.4 19.1 12 24 12c3 0 5.7 1.1 7.8 2.9L37.4 9.3C34 6.3 29.2 4.5 24 4.5c-7.5 0-14 4.2-17.6 10.2z"/>
                <path fill="#4CAF50" d="M24 45.5c5.1 0 9.8-1.7 13.4-4.6l-6.2-5.2C29.4 37.3 26.8 38 24 38c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.9 41.3 16.5 45.5 24 45.5z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2c-.4.3 5.7-4.2 5.7-12.9 0-1.3-.1-2.7-.4-4z"/>
              </svg>
              {loading ? "Signing in..." : "Sign in with Google"}
            </button>

            <p style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.8rem",
              textAlign: "center",
              margin: 0
            }}>
              By signing in, you agree to use this app only for emergency purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;
