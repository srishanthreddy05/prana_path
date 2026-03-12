const { db } = require("../config/firebase");

const usersRef = db.ref("users");
const driversRef = db.ref("drivers");
const policeRef = db.ref("police");

const ROLE_REFS = {
  user: usersRef,
  driver: driversRef,
  police: policeRef,
};

const normalizeRole = (role) => {
  if (role === "driver" || role === "police" || role === "user") return role;
  return "user";
};

const removeFromOtherCollections = async (uid, keepRole) => {
  const removals = [];
  if (keepRole !== "user") removals.push(usersRef.child(uid).remove());
  if (keepRole !== "driver") removals.push(driversRef.child(uid).remove());
  if (keepRole !== "police") removals.push(policeRef.child(uid).remove());
  await Promise.all(removals);
};

const getRecordFromCollection = async (ref, collection, uid) => {
  const snap = await ref.child(uid).once("value");
  if (!snap.exists()) return null;

  const data = snap.val() || {};
  return {
    uid,
    role: normalizeRole(data.role || (collection === "drivers" ? "driver" : collection === "police" ? "police" : "user")),
    ...data,
    __collection: collection,
  };
};

const migrateLegacyIfNeeded = async (user) => {
  if (!user || user.__collection !== "users") return user;

  const role = normalizeRole(user.role);
  if (role === "user") return user;

  const targetRef = ROLE_REFS[role];
  const { __collection, ...cleanUser } = user;

  await targetRef.child(user.uid).set({ ...cleanUser, uid: user.uid, role });
  await usersRef.child(user.uid).remove();

  return { ...cleanUser, uid: user.uid, role, __collection: role === "driver" ? "drivers" : "police" };
};

const getUserWithSource = async (uid) => {
  const [driver, police, user] = await Promise.all([
    getRecordFromCollection(driversRef, "drivers", uid),
    getRecordFromCollection(policeRef, "police", uid),
    getRecordFromCollection(usersRef, "users", uid),
  ]);

  // Prefer role-specific collections first, then users.
  const found = driver || police || user;
  if (!found) return null;

  return migrateLegacyIfNeeded(found);
};

const collectFromRef = async (ref, fallbackRole) => {
  const snap = await ref.once("value");
  if (!snap.exists()) return [];

  const data = snap.val() || {};
  return Object.keys(data).map((uid) => ({
    uid,
    role: normalizeRole(data[uid]?.role || fallbackRole),
    ...data[uid],
  }));
};

const findByEmail = async (ref, collection, email) => {
  const snap = await ref.orderByChild("email").equalTo(email).once("value");
  if (!snap.exists()) return null;
  const data = snap.val();
  const uid = Object.keys(data)[0];
  return {
    uid,
    role: normalizeRole(data[uid]?.role || (collection === "drivers" ? "driver" : collection === "police" ? "police" : "user")),
    ...data[uid],
    __collection: collection,
  };
};

/**
 * Get a user by Firebase UID
 */
const getUser = async (uid) => {
  const user = await getUserWithSource(uid);
  if (!user) return null;
  const { __collection, ...clean } = user;
  return clean;
};

/**
 * Get a user by email (scans all users – small dataset, acceptable)
 */
const getUserByEmail = async (email) => {
  const [driver, police, user] = await Promise.all([
    findByEmail(driversRef, "drivers", email),
    findByEmail(policeRef, "police", email),
    findByEmail(usersRef, "users", email),
  ]);

  const found = driver || police || user;
  if (!found) return null;

  const migrated = await migrateLegacyIfNeeded(found);
  const { __collection, ...clean } = migrated;
  return clean;
};

/**
 * Create or fully overwrite a user record
 */
const createUser = async (uid, data) => {
  const role = normalizeRole(data?.role);
  const targetRef = ROLE_REFS[role];
  const payload = { ...data, uid, role };

  await targetRef.child(uid).set(payload);
  await removeFromOtherCollections(uid, role);

  return payload;
};

/**
 * Update (merge) user fields
 */
const updateUser = async (uid, data) => {
  const existing = await getUserWithSource(uid);
  if (!existing) return null;

  const nextRole = normalizeRole(data?.role || existing.role);
  const targetRef = ROLE_REFS[nextRole];

  const { __collection, ...currentUser } = existing;
  const merged = {
    ...currentUser,
    ...data,
    uid,
    role: nextRole,
  };

  await targetRef.child(uid).set(merged);
  await removeFromOtherCollections(uid, nextRole);

  return merged;
};

/**
 * Get all users (used for blood-group matching, police proximity)
 */
const getAllUsers = async () => {
  const [users, drivers, police] = await Promise.all([
    collectFromRef(usersRef, "user"),
    collectFromRef(driversRef, "driver"),
    collectFromRef(policeRef, "police"),
  ]);
  const seen = new Set();

  // Keep first entry per uid; source order prefers role-specific data over legacy users.
  const ordered = [
    ...drivers,
    ...police,
    ...users,
  ];

  return ordered.filter((u) => {
    if (!u?.uid || seen.has(u.uid)) return false;
    seen.add(u.uid);
    return true;
  });
};

module.exports = { getUser, getUserByEmail, createUser, updateUser, getAllUsers };
