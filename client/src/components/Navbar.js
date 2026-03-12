// src/components/Navbar.js
import { useState, useEffect, useRef } from "react";
import logo from "../assets/logo.png";
import "../styles/Navbar.css";
import { Link } from "react-router-dom";
import { authFetch } from "../utils/api";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

function Navbar({ isLoggedIn, setIsLoggedIn, role }) {
  const [open, setOpen] = useState(false);

  // ✅ FIX: separate refs
  const desktopDropdownRef = useRef(null);
  const mobileDropdownRef = useRef(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await authFetch("/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("role");
      localStorage.removeItem("username");
      localStorage.removeItem("userId");

      setIsLoggedIn(false);
      setOpen(false);
      setDrawerOpen(false);

      window.location.replace("/auth");
    }
  };

  // ✅ FIX: proper click-outside handling
  useEffect(() => {
    const handleClickOutside = (event) => {
      const outsideDesktop =
        desktopDropdownRef.current &&
        !desktopDropdownRef.current.contains(event.target);

      const outsideMobile =
        mobileDropdownRef.current &&
        !mobileDropdownRef.current.contains(event.target);

      if (outsideDesktop && outsideMobile) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const links = {
    user: [
      { name: "Home", path: "/" },
      { name: "Book Ambulance", path: "/bookAmbulance" },
      { name: "Help", path: "/help" },
      { name: "My Bookings", path: "/MyBookings" },
      { name: "Profile", path: "/profile" },
    ],
    driver: [
      { name: "Dashboard", path: "/driver" },
      { name: "Booking History", path: "/driver/history" },
      { name: "Profile", path: "/driver/profile" },
    ],
    police: [
      { name: "Dashboard", path: "/police" },
      { name: "Profile", path: "/police/profile" },
    ],
  };

  const roleLinks = isLoggedIn ? links[role] || [] : links["user"];

  return (
    <nav className="navbar navbar-expand-lg navbar-custom">
      <div className="container-fluid">
        <Link className="navbar-brand d-flex align-items-center me-4" to="/">
          <img src={logo} alt="Logo" className="navbar-logo" />
          <span className="navbar-title">Smart Ambulance</span>
        </Link>

        <button
          className={`navbar-toggler custom-hamburger${drawerOpen ? " open" : ""}`}
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>

        {/* Desktop nav */}
        <div className="collapse navbar-collapse justify-content-end d-none d-lg-flex">
          <ul className="navbar-nav align-items-lg-center">
            {roleLinks.map((link) => (
              <li className="nav-item" key={link.name}>
                <Link className="nav-link" to={link.path}>
                  {link.name}
                </Link>
              </li>
            ))}

            {!isLoggedIn ? (
              <li className="nav-item ms-lg-4">
                <Link className="btn btn-light btn-signup" to="/auth">
                  Login / Sign Up
                </Link>
              </li>
            ) : (
              <li
                className="nav-item ms-lg-4 position-relative"
                ref={desktopDropdownRef}
              >
                <i
                  className="bi bi-person-circle user-icon"
                  onClick={() => setOpen(!open)}
                ></i>
                <div className={`dropdown-menu end-0 mt-2 ${open ? "show" : ""}`}>
                  <span className="dropdown-item-text">Role: {role}</span>
                  <button className="dropdown-item logout-btn" onClick={handleLogout}>
                    Logout <i className="bi bi-box-arrow-right logout-icon"></i>
                  </button>
                </div>
              </li>
            )}
          </ul>
        </div>

        {/* Mobile drawer */}
        <div className={`mobile-drawer${drawerOpen ? " open" : ""}`}>
          <ul className="navbar-nav">
            {roleLinks.map((link) => (
              <li className="nav-item" key={link.name}>
                <Link
                  className="nav-link"
                  to={link.path}
                  onClick={() => setDrawerOpen(false)}
                >
                  {link.name}
                </Link>
              </li>
            ))}

            {!isLoggedIn ? (
              <li className="nav-item">
                <Link
                  className="btn btn-light btn-signup"
                  to="/auth"
                  onClick={() => setDrawerOpen(false)}
                >
                  Login / Sign Up
                </Link>
              </li>
            ) : (
              <li
                className="nav-item position-relative"
                ref={mobileDropdownRef}
              >
                <i
                  className="bi bi-person-circle user-icon"
                  onClick={() => setOpen(!open)}
                ></i>
                <div className={`dropdown-menu mt-2 ${open ? "show" : ""}`}>
                  <span className="dropdown-item-text">Role: {role}</span>
                  <button className="dropdown-item logout-btn" onClick={handleLogout}>
                    Logout <i className="bi bi-box-arrow-right logout-icon"></i>
                  </button>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
