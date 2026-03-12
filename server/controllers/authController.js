const { verifyIdToken } = require("../config/firebase");
const { getUser, createUser, updateUser } = require("../models/User");

const ALLOWED_ROLES = ["user", "driver", "police"];

/**
 * POST /api/auth/google
 * Receives Firebase ID token from client, verifies it,
 * upserts the user in Firebase RTDB, and returns user data.
 */
const googleLogin = async (req, res) => {
  try {
    const { idToken, selectedRole } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    if (!selectedRole || !ALLOWED_ROLES.includes(selectedRole)) {
      return res.status(400).json({
        message: "A valid selectedRole is required (user, driver, police)",
      });
    }

    // Verify the token with Firebase Admin
    const decoded = await verifyIdToken(idToken);
    const { uid, email, name, picture } = decoded;

    // Look up existing user in RTDB
    let user = await getUser(uid);

    if (!user) {
      // First-time login → create user record with selected role
      user = await createUser(uid, {
        email: email || "",
        username: name || email || "",
        displayName: name || email || "",
        profilePhoto: picture || "",
        role: selectedRole,
        isVerified: true,
        createdAt: Date.now(),
        // Profile fields (to be filled later)
        name: name || "",
        mobileNumber: "",
        mobile: "",
        dateOfBirth: "",
        bloodGroup: "",
        area: "",
        pincode: "",
        station: "",
        vehicleNumber: "",
        onDuty: false,
        currentLocation: null,
      });
      console.log(`✅ New user created: ${uid} (${email})`);
    } else {
      // Bind role for legacy users without role, otherwise enforce existing role mapping.
      if (!user.role) {
        user = await updateUser(uid, { role: selectedRole });
      } else if (user.role !== selectedRole) {
        return res.status(403).json({
          message: `This account is registered as '${user.role}'. Please select '${user.role}' to continue.`,
        });
      }

      console.log(`✅ Existing user logged in: ${uid} (${email})`);
    }

    return res.json({
      message: "Login successful",
      user,
    });
  } catch (err) {
    console.error("Google login error:", err);
    return res.status(401).json({ message: "Invalid or expired ID token" });
  }
};

/**
 * POST /api/auth/logout
 * Firebase auth state is managed client-side, so server-side logout is a no-op.
 */
const logout = async (req, res) => {
  return res.json({ message: "Logged out successfully" });
};

module.exports = { googleLogin, logout };
