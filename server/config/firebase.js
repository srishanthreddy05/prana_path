const admin = require("firebase-admin");

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  console.log("✅ Firebase Admin initialized");
}

const db = admin.database();

/**
 * Verify a Firebase ID token sent from the client.
 * Returns the decoded token (contains uid, email, etc.)
 */
const verifyIdToken = async (idToken) => {
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { admin, db, verifyIdToken };
