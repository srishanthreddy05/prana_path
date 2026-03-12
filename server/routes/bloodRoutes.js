const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/authMiddleware");
const { requireCompleteProfile } = require("../middleware/profileMiddleware");
const {
  createBloodRequest,
  getMyRequests,
  getMyDonations,
  getPendingRequests,
  acceptBloodRequest,
  completeDonation,
  cancelBloodRequest,
} = require("../controllers/bloodController");

// POST /api/blood/request - Create a new blood request
router.post("/request", isAuthenticated, requireCompleteProfile, createBloodRequest);

// GET /api/blood/my-requests - Get all requests made by user
router.get("/my-requests", isAuthenticated, getMyRequests);

// GET /api/blood/my-donations - Get all donations made by user
router.get("/my-donations", isAuthenticated, getMyDonations);

// GET /api/blood/pending - Get pending requests matching user's blood group
router.get("/pending", isAuthenticated, getPendingRequests);

// PUT /api/blood/accept/:requestId - Accept a blood request
router.put("/accept/:requestId", isAuthenticated, acceptBloodRequest);

// PUT /api/blood/complete/:requestId - Complete a donation
router.put("/complete/:requestId", isAuthenticated, completeDonation);

// PUT /api/blood/cancel/:requestId - Cancel a blood request
router.put("/cancel/:requestId", isAuthenticated, cancelBloodRequest);

module.exports = router;
