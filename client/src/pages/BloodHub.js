import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "../styles/BloodHub.css";
import { getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";
import { useProfileCompletion } from "../hooks/useProfileCompletion";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const URGENCY_LEVELS = [
  { value: "low", label: "Normal", color: "#4caf50" },
  { value: "high", label: "Emergency", color: "#f44336" },
];

const BloodHub = ({ showToast }) => {
  const location = useLocation();
  const myRequestsRef = useRef(null);
  const myDonationsRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    bloodGroup: "",
    hospital: "",
    urgency: "low",
  });
  const [submitting, setSubmitting] = useState(false);

  // Data state
  const [myRequests, setMyRequests] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("request");

  // Scroll to section based on navigation state
  // Profile completion status
  const { isProfileComplete } = useProfileCompletion(localStorage.getItem("isLoggedIn") === "true");

  useEffect(() => {
    if (location.state?.scrollTo === "donations" && myDonationsRef.current) {
      setTimeout(() => {
        myDonationsRef.current.scrollIntoView({ behavior: "smooth" });
        setActiveTab("donations");
      }, 300);
    } else if (location.state?.scrollTo === "requests" && myRequestsRef.current) {
      setTimeout(() => {
        myRequestsRef.current.scrollIntoView({ behavior: "smooth" });
        setActiveTab("requests");
      }, 300);
    }
  }, [location.state]);

  // Fetch data on mount
  useEffect(() => {
    fetchAllData();
    setupSocketListeners();

    return () => {
      const socket = getSocket();
      socket.off("blood:request");
      socket.off("blood:accepted");
      socket.off("blood:completed");
      socket.off("blood:cancelled");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupSocketListeners = () => {
    const socket = getSocket();

    socket.on("blood:accepted", (data) => {
      showToast("A donor has accepted your blood request!", "success");
      fetchMyRequests();
    });

    socket.on("blood:completed", () => {
      showToast("Donation has been marked as completed!", "success");
      fetchAllData();
    });

    socket.on("blood:cancelled", () => {
      showToast("Blood request has been cancelled by the requester", "info");
      fetchMyDonations();
      fetchPendingRequests();
    });
  };

  const fetchAllData = async () => {
    await Promise.all([fetchMyRequests(), fetchMyDonations(), fetchPendingRequests()]);
  };

  const fetchMyRequests = async () => {
    try {
      const res = await authFetch("/blood/my-requests");
      const data = await res.json();
      if (res.ok) {
        setMyRequests(data);
      }
    } catch (err) {
      console.error("Error fetching my requests:", err);
    }
  };

  const fetchMyDonations = async () => {
    try {
      const res = await authFetch("/blood/my-donations");
      const data = await res.json();
      if (res.ok) {
        setMyDonations(data);
      }
    } catch (err) {
      console.error("Error fetching my donations:", err);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await authFetch("/blood/pending");
      const data = await res.json();
      if (res.ok) {
        setPendingRequests(data);
      }
    } catch (err) {
      console.error("Error fetching pending requests:", err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bloodGroup || !formData.hospital || !formData.urgency) {
      showToast("Please fill in all fields", "error");
      return;
    }

    setSubmitting(true);

    // Block if profile incomplete
    if (!isProfileComplete) {
      showToast("Complete your profile to continue", "error");
      window.location.replace("/profile");
      return;
    }
    try {
      const res = await authFetch("/blood/request", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        showToast("Blood request submitted successfully!", "success");
        setFormData({ bloodGroup: "", hospital: "", urgency: "medium" });
        await fetchMyRequests();
        
        // Scroll to my requests section
        setTimeout(() => {
          if (myRequestsRef.current) {
            myRequestsRef.current.scrollIntoView({ behavior: "smooth" });
            setActiveTab("requests");
          }
        }, 300);
      } else {
        showToast(data.message || "Failed to submit request", "error");
      }
    } catch (err) {
      console.error("Error submitting request:", err);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const res = await authFetch(`/blood/accept/${requestId}`, {
        method: "PUT",
      });

      const data = await res.json();

      if (res.ok) {
        showToast("You have accepted the blood request!", "success");
        await fetchAllData();
      } else {
        showToast(data.message || "Failed to accept request", "error");
      }
    } catch (err) {
      console.error("Error accepting request:", err);
      showToast("Network error. Please try again.", "error");
    }
  };

  const handleCompleteRequest = async (requestId) => {
    try {
      const res = await authFetch(`/blood/complete/${requestId}`, {
        method: "PUT",
      });

      const data = await res.json();

      if (res.ok) {
        showToast("Donation marked as completed!", "success");
        await fetchAllData();
      } else {
        showToast(data.message || "Failed to complete donation", "error");
      }
    } catch (err) {
      console.error("Error completing donation:", err);
      showToast("Network error. Please try again.", "error");
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm("Are you sure you want to cancel this request?")) return;

    try {
      const res = await authFetch(`/blood/cancel/${requestId}`, {
        method: "PUT",
      });

      const data = await res.json();

      if (res.ok) {
        showToast("Request cancelled successfully", "info");
        await fetchMyRequests();
      } else {
        showToast(data.message || "Failed to cancel request", "error");
      }
    } catch (err) {
      console.error("Error cancelling request:", err);
      showToast("Network error. Please try again.", "error");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const getUrgencyColor = (urgency) => {
    const level = URGENCY_LEVELS.find((l) => l.value === urgency);
    return level ? level.color : "#666";
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      pending: "#ff9800",
      accepted: "#2196f3",
      completed: "#4caf50",
      cancelled: "#f44336",
    };
    return (
      <span className="status-badge" style={{ backgroundColor: statusColors[status] }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Separate current and history
  const currentRequest = myRequests.find((r) => r.status === "pending" || r.status === "accepted");
  const requestHistory = myRequests.filter((r) => r.status === "completed" || r.status === "cancelled");

  const currentDonation = myDonations.find((d) => d.status === "accepted");
  const donationHistory = myDonations.filter((d) => d.status === "completed" || d.status === "cancelled");

  // Donor notification on login
  useEffect(() => {
    async function notifyDonorIfNeeded() {
      const role = localStorage.getItem("role");
      if (role !== "donor") return;
      // Try to get bloodGroup from profile API
      let bloodGroup = null;
      try {
        const res = await authFetch("/users/profile");
        const data = await res.json();
        if (res.ok && data.bloodGroup) bloodGroup = data.bloodGroup;
      } catch {}
      if (!bloodGroup) return;
      // Check for matching pending requests
      if (pendingRequests.some(r => r.bloodGroup === bloodGroup)) {
        showToast("You have new blood requests matching your group!", "info");
      }
    }
    if (pendingRequests.length > 0) notifyDonorIfNeeded();
    // eslint-disable-next-line
  }, [pendingRequests]);

  return (
    <div className="blood-hub-container">
      <div className="blood-hub-header">
        <h1> Blood Hub</h1>
        <p>Connect with donors and save lives</p>
      </div>

      {/* Tab Navigation */}
      <div className="blood-hub-tabs">
        <button
          className={`tab-btn ${activeTab === "request" ? "active" : ""}`}
          onClick={() => setActiveTab("request")}
        >
          <i className="fa-solid fa-hand-holding-droplet"></i> Request Blood
        </button>
        <button
          className={`tab-btn ${activeTab === "requests" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("requests");
            setTimeout(() => myRequestsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }}
        >
          <i className="fa-solid fa-list"></i> My Requests
        </button>
        <button
          className={`tab-btn ${activeTab === "donations" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("donations");
            setTimeout(() => myDonationsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }}
        >
          <i className="fa-solid fa-heart"></i> My Donations
        </button>
      </div>

      {/* Section 1: Request Blood Form */}
      <section className={`blood-section ${activeTab === "request" ? "active" : ""}`}>
        <div className="section-header">
          <h2>
            <i className="fa-solid fa-hand-holding-droplet"></i> Request Blood
          </h2>
        </div>
        <form className="blood-request-form" onSubmit={handleSubmit}>
          <table className="form-table">
            <tbody>
              <tr className="form-row">
                <td className="form-label">Blood Group</td>
                <td className="form-colon">:</td>
                <td className="form-input">
                  <select
                    id="bloodGroup"
                    name="bloodGroup"
                    value={formData.bloodGroup}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Blood Group</option>
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr className="form-row">
                <td className="form-label">Hospital</td>
                <td className="form-colon">:</td>
                <td className="form-input">
                  <input
                    type="text"
                    id="hospital"
                    name="hospital"
                    value={formData.hospital}
                    onChange={handleInputChange}
                    placeholder="Enter hospital name"
                    required
                  />
                </td>
              </tr>
              <tr className="form-row">
                <td className="form-label">Urgency</td>
                <td className="form-colon">:</td>
                <td className="form-input">
                  <select
                    id="urgency"
                    name="urgency"
                    value={formData.urgency}
                    onChange={handleInputChange}
                    required
                  >
                    {URGENCY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane"></i> Submit Request
              </>
            )}
          </button>
        </form>
      </section>

      {/* Section 2: My Requests */}
      <section
        ref={myRequestsRef}
        className={`blood-section ${activeTab === "requests" ? "active" : ""}`}
      >
        <div className="section-header">
          <h2>
            <i className="fa-solid fa-list"></i> My Requests
          </h2>
        </div>

        {/* Current Request */}
        {currentRequest && (
          <div className="subsection">
            <h3>
              <i className="fa-solid fa-clock"></i> Current Request
            </h3>
            <div className="request-card current">
              <div className="card-header">
                <span className="blood-type">{currentRequest.bloodGroup}</span>
                {getStatusBadge(currentRequest.status)}
              </div>
              <div className="card-body">
                <p>
                  <i className="fa-solid fa-hospital"></i>
                  <strong>Hospital:</strong> {currentRequest.hospital}
                </p>
                <p>
                  <i className="fa-solid fa-clock"></i>
                  <strong>Urgency:</strong>
                  <span
                    className="urgency-badge"
                    style={{ backgroundColor: getUrgencyColor(currentRequest.urgency) }}
                  >
                    {currentRequest.urgency}
                  </span>
                </p>
                <p>
                  <i className="fa-solid fa-calendar"></i>
                  <strong>Requested:</strong> {formatDate(currentRequest.createdAt)}
                </p>
                {currentRequest.donor && (
                  <>
                    <div className="donor-info">
                      <h4>
                        <i className="fa-solid fa-user-check"></i> Donor Details
                      </h4>
                      <p>
                        <i className="fa-solid fa-user"></i>
                        <strong>Name:</strong> {currentRequest.donor.displayName || "Anonymous"}
                      </p>
                      <p>
                        <i className="fa-solid fa-phone"></i>
                        <strong>Mobile:</strong> {currentRequest.donor.mobile || "N/A"}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="card-actions">
                {currentRequest.status === "accepted" && (
                  <button
                    className="complete-btn"
                    onClick={() => handleCompleteRequest(currentRequest._id)}
                  >
                    <i className="fa-solid fa-check"></i> Mark Completed
                  </button>
                )}
                {currentRequest.status === "pending" && (
                  <button
                    className="cancel-btn"
                    onClick={() => handleCancelRequest(currentRequest._id)}
                  >
                    <i className="fa-solid fa-times"></i> Cancel Request
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Request History */}
        <div className="subsection">
          <h3>
            <i className="fa-solid fa-history"></i> Request History
          </h3>
          {requestHistory.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-inbox"></i>
              <p>No previous requests</p>
            </div>
          ) : (
            <div className="history-list">
              {requestHistory.map((request) => (
                <div key={request._id} className="history-card">
                  <div className="card-header">
                    <span className="blood-type">{request.bloodGroup}</span>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="card-body">
                    <p>
                      <i className="fa-solid fa-hospital"></i> {request.hospital}
                    </p>
                    <p>
                      <i className="fa-solid fa-calendar"></i> {formatDate(request.createdAt)}
                    </p>
                    {request.donor && (
                      <p>
                        <i className="fa-solid fa-user"></i>
                        <strong>Donor:</strong> {request.donor.displayName || "Anonymous"} |{" "}
                        {request.donor.mobile || "N/A"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 3: My Donations */}
      <section
        ref={myDonationsRef}
        className={`blood-section ${activeTab === "donations" ? "active" : ""}`}
      >
        <div className="section-header">
          <h2>
            <i className="fa-solid fa-heart"></i> My Donations
          </h2>
        </div>

        {/* Pending Donation Requests (for donor to accept) */}
        {pendingRequests.length > 0 && (
          <div className="subsection">
            <h3>
              <i className="fa-solid fa-bell"></i> Available Donation Requests
            </h3>
            <div className="pending-requests-list">
              {pendingRequests.map((request) => (
                <div key={request._id} className="request-card pending-donation">
                  <div className="card-header">
                    <span className="blood-type">{request.bloodGroup}</span>
                    <span
                      className="urgency-badge"
                      style={{ backgroundColor: getUrgencyColor(request.urgency) }}
                    >
                      {request.urgency}
                    </span>
                  </div>
                  <div className="card-body">
                    <p>
                      <i className="fa-solid fa-user"></i>
                      <strong>Patient:</strong> {request.requester?.displayName || "Anonymous"}
                    </p>
                    <p>
                      <i className="fa-solid fa-phone"></i>
                      <strong>Mobile:</strong> {request.requester?.mobile || "N/A"}
                    </p>
                    <p>
                      <i className="fa-solid fa-hospital"></i>
                      <strong>Hospital:</strong> {request.hospital}
                    </p>
                    <p>
                      <i className="fa-solid fa-calendar"></i>
                      <strong>Requested:</strong> {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <div className="card-actions">
                    <button
                      className="accept-btn"
                      onClick={() => handleAcceptRequest(request._id)}
                    >
                      <i className="fa-solid fa-hand-holding-heart"></i> Accept & Donate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Donation (accepted but not completed) */}
        {currentDonation && (
          <div className="subsection">
            <h3>
              <i className="fa-solid fa-clock"></i> Current Donation
            </h3>
            <div className="request-card current">
              <div className="card-header">
                <span className="blood-type">{currentDonation.bloodGroup}</span>
                {getStatusBadge(currentDonation.status)}
              </div>
              <div className="card-body">
                <p>
                  <i className="fa-solid fa-user"></i>
                  <strong>Patient:</strong>{" "}
                  {currentDonation.requester?.displayName || "Anonymous"}
                </p>
                <p>
                  <i className="fa-solid fa-phone"></i>
                  <strong>Mobile:</strong> {currentDonation.requester?.mobile || "N/A"}
                </p>
                <p>
                  <i className="fa-solid fa-hospital"></i>
                  <strong>Hospital:</strong> {currentDonation.hospital}
                </p>
                <p>
                  <i className="fa-solid fa-clock"></i>
                  <strong>Urgency:</strong>
                  <span
                    className="urgency-badge"
                    style={{ backgroundColor: getUrgencyColor(currentDonation.urgency) }}
                  >
                    {currentDonation.urgency}
                  </span>
                </p>
                <p>
                  <i className="fa-solid fa-calendar"></i>
                  <strong>Accepted:</strong> {formatDate(currentDonation.acceptedAt)}
                </p>
              </div>
              <div className="card-actions">
                <button
                  className="complete-btn"
                  onClick={() => handleCompleteRequest(currentDonation._id)}
                >
                  <i className="fa-solid fa-check"></i> Mark Completed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Donation History */}
        <div className="subsection">
          <h3>
            <i className="fa-solid fa-history"></i> Donation History
          </h3>
          {donationHistory.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-heart"></i>
              <p>No previous donations</p>
            </div>
          ) : (
            <div className="history-list">
              {donationHistory.map((donation) => (
                <div key={donation._id} className="history-card">
                  <div className="card-header">
                    <span className="blood-type">{donation.bloodGroup}</span>
                    {getStatusBadge(donation.status)}
                  </div>
                  <div className="card-body">
                    <p>
                      <i className="fa-solid fa-user"></i>
                      <strong>Patient:</strong>{" "}
                      {donation.requester?.displayName || "Anonymous"}
                    </p>
                    <p>
                      <i className="fa-solid fa-phone"></i>
                      <strong>Mobile:</strong> {donation.requester?.mobile || "N/A"}
                    </p>
                    <p>
                      <i className="fa-solid fa-hospital"></i> {donation.hospital}
                    </p>
                    <p>
                      <i className="fa-solid fa-clock"></i>
                      <strong>Urgency:</strong>
                      <span
                        className="urgency-badge"
                        style={{ backgroundColor: getUrgencyColor(donation.urgency) }}
                      >
                        {donation.urgency}
                      </span>
                    </p>
                    <p>
                      <i className="fa-solid fa-calendar"></i>{" "}
                      {formatDate(donation.completedAt || donation.acceptedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BloodHub;
