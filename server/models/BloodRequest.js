const { db } = require("../config/firebase");

const bloodRef = db.ref("bloodRequests");

/**
 * Create a new blood request
 */
const createBloodRequest = async (data) => {
  const ref = bloodRef.push();
  const id = ref.key;
  const record = {
    id,
    ...data,
    status: "pending",
    donor: null,
    acceptedAt: null,
    completedAt: null,
    createdAt: Date.now(),
  };
  await ref.set(record);
  return record;
};

/**
 * Get a single blood request by id
 */
const getBloodRequest = async (id) => {
  const snap = await bloodRef.child(id).once("value");
  if (!snap.exists()) return null;
  return { id, ...snap.val() };
};

/**
 * Update (merge) fields on a blood request
 */
const updateBloodRequest = async (id, data) => {
  await bloodRef.child(id).update(data);
  const snap = await bloodRef.child(id).once("value");
  return { id, ...snap.val() };
};

/**
 * Get blood requests created by a user (as requester)
 */
const getBloodRequestsByUser = async (uid) => {
  const snap = await bloodRef.orderByChild("requesterId").equalTo(uid).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => ({ id, ...data[id] }))
    .sort((a, b) => b.createdAt - a.createdAt);
};

/**
 * Get donations accepted by a user (as donor)
 */
const getDonationsByUser = async (uid) => {
  const snap = await bloodRef.orderByChild("donor").equalTo(uid).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => ({ id, ...data[id] }))
    .sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
};

/**
 * Get all pending blood requests matching a blood group (excluding requester)
 */
const getPendingByBloodGroup = async (bloodGroup, excludeUid) => {
  const snap = await bloodRef.orderByChild("bloodGroup").equalTo(bloodGroup).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.keys(data)
    .map((id) => ({ id, ...data[id] }))
    .filter((r) => r.status === "pending" && r.requesterId !== excludeUid)
    .sort((a, b) => b.createdAt - a.createdAt);
};

module.exports = {
  createBloodRequest,
  getBloodRequest,
  updateBloodRequest,
  getBloodRequestsByUser,
  getDonationsByUser,
  getPendingByBloodGroup,
};
