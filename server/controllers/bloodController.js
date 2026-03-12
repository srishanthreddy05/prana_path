const {
  createBloodRequest,
  getBloodRequest,
  updateBloodRequest,
  getBloodRequestsByUser,
  getDonationsByUser,
  getPendingByBloodGroup,
} = require("../models/BloodRequest");
const { getUser, getAllUsers } = require("../models/User");

// Create a new blood request
const createBloodRequestHandler = async (req, res) => {
  try {
    const { bloodGroup, hospital, urgency } = req.body;
    if (!bloodGroup || !hospital || !urgency) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing pending request from this user
    const myRequests = await getBloodRequestsByUser(req.user.uid);
    const existingRequest = myRequests.find((r) => r.status === "pending");
    if (existingRequest) {
      return res.status(400).json({
        message: "You already have a pending blood request",
        existingRequest,
      });
    }

    const bloodRequest = await createBloodRequest({
      requesterId: req.user.uid,
      bloodGroup,
      hospital,
      urgency,
    });

    // Find potential donors (users with matching blood group)
    const allUsers = await getAllUsers();
    const potentialDonors = allUsers.filter(
      (u) => u.role === "user" && u.bloodGroup === bloodGroup && u.uid !== req.user.uid
    );

    const io = req.app.get("io");
    if (io && potentialDonors.length > 0) {
      const requester = await getUser(req.user.uid);
      potentialDonors.forEach((donor) => {
        io.to(`user:${donor.uid}`).emit("blood:request", {
          requestId: bloodRequest.id,
          bloodGroup,
          hospital,
          urgency,
          requesterName: requester?.displayName || "Anonymous",
          requesterMobile: requester?.mobile || "N/A",
        });
      });
      console.log(`🩸 Blood request sent to ${potentialDonors.length} potential donors`);
    }

    res.status(201).json({
      message: "Blood request created successfully",
      bloodRequest,
    });
  } catch (err) {
    console.error("Error creating blood request:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all blood requests made by the logged-in user
const getMyRequests = async (req, res) => {
  try {
    const requests = await getBloodRequestsByUser(req.user.uid);
    res.json(requests);
  } catch (err) {
    console.error("Error fetching my requests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all donations accepted by the logged-in user
const getMyDonations = async (req, res) => {
  try {
    const donations = await getDonationsByUser(req.user.uid);
    res.json(donations);
  } catch (err) {
    console.error("Error fetching my donations:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get pending blood requests for potential donors (matching blood group)
const getPendingRequests = async (req, res) => {
  try {
    const user = await getUser(req.user.uid);
    if (!user?.bloodGroup) {
      return res.status(400).json({
        message: "Please update your blood group in your profile to see donation requests",
      });
    }

    const pendingRequests = await getPendingByBloodGroup(user.bloodGroup, req.user.uid);
    res.json(pendingRequests);
  } catch (err) {
    console.error("Error fetching pending requests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Accept a blood request (become a donor)
const acceptBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const bloodRequest = await getBloodRequest(requestId);

    if (!bloodRequest) return res.status(404).json({ message: "Blood request not found" });
    if (bloodRequest.status !== "pending")
      return res.status(400).json({ message: "This request is no longer available" });
    if (bloodRequest.requesterId === req.user.uid)
      return res.status(400).json({ message: "You cannot accept your own request" });

    const donor = await getUser(req.user.uid);
    if (donor.bloodGroup !== bloodRequest.bloodGroup)
      return res.status(400).json({ message: "Your blood group doesn't match the request" });

    const updated = await updateBloodRequest(requestId, {
      donor: req.user.uid,
      status: "accepted",
      acceptedAt: Date.now(),
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${bloodRequest.requesterId}`).emit("blood:accepted", {
        requestId: bloodRequest.id,
        donorName: donor.displayName || "Anonymous",
        donorMobile: donor.mobile || "N/A",
      });
    }

    res.json({ message: "Blood request accepted successfully", bloodRequest: updated });
  } catch (err) {
    console.error("Error accepting blood request:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Complete a blood donation
const completeDonation = async (req, res) => {
  try {
    const { requestId } = req.params;
    const bloodRequest = await getBloodRequest(requestId);

    if (!bloodRequest) return res.status(404).json({ message: "Blood request not found" });
    if (bloodRequest.status !== "accepted")
      return res.status(400).json({ message: "This request cannot be completed" });

    const uid = req.user.uid;
    if (bloodRequest.donor !== uid && bloodRequest.requesterId !== uid) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await updateBloodRequest(requestId, {
      status: "completed",
      completedAt: Date.now(),
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${bloodRequest.requesterId}`).emit("blood:completed", { requestId: bloodRequest.id });
      io.to(`user:${bloodRequest.donor}`).emit("blood:completed", { requestId: bloodRequest.id });
    }

    res.json({ message: "Donation marked as completed", bloodRequest: updated });
  } catch (err) {
    console.error("Error completing donation:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Cancel a blood request
const cancelBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const bloodRequest = await getBloodRequest(requestId);

    if (
      !bloodRequest ||
      bloodRequest.requesterId !== req.user.uid ||
      !["pending", "accepted"].includes(bloodRequest.status)
    ) {
      return res.status(404).json({ message: "Blood request not found or cannot be cancelled" });
    }

    const previousDonor = bloodRequest.donor;
    const updated = await updateBloodRequest(requestId, { status: "cancelled" });

    const io = req.app.get("io");
    if (io && previousDonor) {
      io.to(`user:${previousDonor}`).emit("blood:cancelled", { requestId: bloodRequest.id });
    }

    res.json({ message: "Blood request cancelled successfully", bloodRequest: updated });
  } catch (err) {
    console.error("Error cancelling blood request:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createBloodRequest: createBloodRequestHandler,
  getMyRequests,
  getMyDonations,
  getPendingRequests,
  acceptBloodRequest,
  completeDonation,
  cancelBloodRequest,
};
