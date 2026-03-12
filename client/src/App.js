// src/App.js
import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { getSocket } from "./utils/socket";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "./utils/api";


// Pages & Components
import Auth from "./pages/Auth";
import HomeRouter from "./pages/HomeRouter";
import BookAmbulance from "./pages/bookAmbulance";
import LiveTracking from "./pages/LiveTracking";
import Help from "./pages/help";
import ContactUs from "./pages/contactUs";
import MyBookings from "./pages/MyBookings";
import DriverDashboard from "./pages/DriverDashboard";
import DriverHistory from "./pages/DriverHistory";
import DriverTracking from "./pages/DriverTracking";
import VolunteerDashboard from "./pages/VolunteerDashboard";
import PoliceDashboard from "./pages/PoliceDashboard";
import PoliceBookingDetail from "./pages/PoliceBookingDetail";
import PoliceProfile from "./pages/PoliceProfile";
import DriverProfile from "./pages/DriverProfile";
import UserProfile from "./pages/profile";
import BloodHub from "./pages/BloodHub";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Toast from "./components/Toast";
import "./styles/toast.css"; // Import toast styles globally
import Footer from "./components/Footer";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authRole, setAuthRole] = useState(localStorage.getItem("role") || "");

  // Global toast state
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  useEffect(() => {
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const bootstrapSession = async () => {
        if (firebaseUser) {
          setIsLoggedIn(true);
          setAuthRole(localStorage.getItem("role") || "");

          try {
            const res = await authFetch("/users/profile");
            if (res.ok) {
              const user = await res.json();
              localStorage.setItem("isLoggedIn", "true");
              localStorage.setItem("role", user.role || "user");
              setAuthRole(user.role || "user");
              localStorage.setItem(
                "username",
                user.displayName || user.username || user.email || ""
              );
              localStorage.setItem("userId", user.uid || firebaseUser.uid);

              if ((user.role || "user") === "user" && (user.uid || firebaseUser.uid)) {
                const socket = getSocket();
                socket.emit("user:join", user.uid || firebaseUser.uid);
              }
            }
          } catch (err) {
            console.error("Failed to bootstrap user profile:", err);
          }
        } else {
          setIsLoggedIn(false);
          setAuthRole("");
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("role");
          localStorage.removeItem("username");
          localStorage.removeItem("userId");
        }

        setAuthReady(true);
      };

      bootstrapSession();
    });
    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return null;
  }

  return (
    <Router>
      <Navbar isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} role={authRole} />

      {/* Routes */}
      <Routes>
        <Route path="/" element={<HomeRouter showToast={showToast} />} />
        <Route path="/auth" element={<Auth setIsLoggedIn={setIsLoggedIn} setAuthRole={setAuthRole} />} />
        <Route path="/bookAmbulance" element={<BookAmbulance showToast={showToast} />} />
        <Route path="/track/:bookingId" element={<LiveTracking showToast={showToast} />} />
        <Route path="/help" element={<Help />} />
        <Route path="/contactUs" element={<ContactUs />} />
        <Route path="/MyBookings" element={<MyBookings showToast={showToast} />} />
        <Route path="/driver" element={
          <ProtectedRoute allowedRoles={["driver"]}>
            <DriverDashboard showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/driver/history" element={
          <ProtectedRoute allowedRoles={["driver"]}>
            <DriverHistory showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/driver/track/:bookingId" element={
          <ProtectedRoute allowedRoles={["driver"]}>
            <DriverTracking showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/driver/profile" element={
          <ProtectedRoute allowedRoles={["driver"]}>
            <DriverProfile showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/volunteer" element={
          <ProtectedRoute allowedRoles={["user"]}>
            <VolunteerDashboard showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/police" element={
          <ProtectedRoute allowedRoles={["police"]}>
            <PoliceDashboard showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/police/bookings" element={
          <ProtectedRoute allowedRoles={["police"]}>
            <PoliceDashboard showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/police/booking/:bookingId" element={
          <ProtectedRoute allowedRoles={["police"]}>
            <PoliceBookingDetail showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/police/profile" element={
          <ProtectedRoute allowedRoles={["police"]}>
            <PoliceProfile showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/profile" element={
          <ProtectedRoute allowedRoles={["user"]}>
            <UserProfile showToast={showToast} />
          </ProtectedRoute>
        }/>
        <Route path="/bloodhub" element={
          <ProtectedRoute allowedRoles={["user"]}>
            <BloodHub showToast={showToast} />
          </ProtectedRoute>
        }/>
      </Routes>

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))}
          />
        ))}
      </div>
      <Footer />
    </Router>
  );
}

export default App;
