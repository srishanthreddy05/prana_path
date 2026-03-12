const { verifyIdToken } = require("../config/firebase");
const { getUser } = require("../models/User");

/**
 * Middleware: verify Firebase ID token in Authorization header.
 * Attaches req.user (the Firebase RTDB user record) if valid.
 */
const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyIdToken(idToken);
    const user = await getUser(decoded.uid);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: user not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/** Only allow drivers */
const isDriver = (req, res, next) => {
  if (req.user?.role === "driver") return next();
  res.status(403).json({ message: "Forbidden: Only drivers allowed" });
};

/** Only allow police */
const isPolice = (req, res, next) => {
  if (req.user?.role === "police") return next();
  res.status(403).json({ message: "Forbidden: Only police allowed" });
};

/** Allow professional drivers AND active ambulance volunteers */
const isAmbulanceResponder = (req, res, next) => {
  const { role, volunteerRole, volunteerActive } = req.user || {};
  if (role === "driver" || (volunteerRole === "ambulance_volunteer" && volunteerActive === true)) {
    return next();
  }
  res.status(403).json({ message: "Forbidden: Only ambulance drivers and active volunteers allowed" });
};

module.exports = { isAuthenticated, isDriver, isPolice, isAmbulanceResponder };
