const { getUser } = require("../models/User");

/**
 * Middleware to check if user profile is complete.
 * Should be used AFTER isAuthenticated middleware.
 */
const requireCompleteProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch fresh user data from Firebase
    const user = await getUser(req.user.uid);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const name = user.displayName || user.name || "";
    const mobile = user.mobile || user.mobileNumber || "";
    const dateOfBirth = user.dob || user.dateOfBirth || "";
    const bloodGroup = user.bloodGroup || "";
    const area = user.area || "";
    const pincode = user.pincode || "";

    const isComplete = !!(
      String(name).trim() &&
      /^\d{10}$/.test(String(mobile).trim()) &&
      String(dateOfBirth).trim() &&
      String(bloodGroup).trim() &&
      String(area).trim() &&
      /^\d{6}$/.test(String(pincode).trim())
    );

    if (!isComplete) {
      return res.status(403).json({
        message: "Please complete your profile to continue",
        missingFields: getMissingFields(user),
      });
    }

    next();
  } catch (err) {
    console.error("Profile middleware error:", err);
    return res.status(500).json({ message: "Unable to verify profile" });
  }
};

const getMissingFields = (user) => {
  const missing = [];
  const name = user.displayName || user.name || "";
  const mobile = user.mobile || user.mobileNumber || "";
  const dateOfBirth = user.dob || user.dateOfBirth || "";

  if (!String(name).trim()) missing.push("name");
  if (!/^\d{10}$/.test(String(mobile).trim())) missing.push("mobileNumber");
  if (!String(dateOfBirth).trim()) missing.push("dateOfBirth");
  if (!String(user.bloodGroup || "").trim()) missing.push("bloodGroup");
  if (!String(user.area || "").trim()) missing.push("area");
  if (!/^\d{6}$/.test(String(user.pincode || "").trim())) missing.push("pincode");
  return missing;
};

module.exports = { requireCompleteProfile };
