// src/components/ProtectedRoute.js
import { Navigate } from "react-router-dom";
import { auth } from "../firebase";

export default function ProtectedRoute({ children, allowedRoles }) {
  // Use Firebase auth current user OR localStorage fallback during initial load
  const isLoggedIn =
    !!auth.currentUser || localStorage.getItem("isLoggedIn") === "true";
  const role = localStorage.getItem("role");

  if (!isLoggedIn) {
    // Not logged in, redirect to auth page
    return <Navigate to="/auth" />;
  }

  // Wait for role hydration to avoid redirecting to wrong dashboard.
  if (!role) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Logged in but role not allowed, redirect to role-specific page
    if (role === "driver") return <Navigate to="/driver" />;
    if (role === "police") return <Navigate to="/police" />;
    return <Navigate to="/" />; // fallback user home
  }

  return children; // authorized
}
