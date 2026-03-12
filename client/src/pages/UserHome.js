import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/UserHome.css";
import { getSocket } from "../utils/socket";
import { authFetch } from "../utils/api";
import chatbotIcon from "../assets/gai.png";

const normalizeTranscript = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wakeWordPatterns = [
  /\bhey\s+prana\s*path\b/,
  /\bhey\s+pranapath\b/,
  /\bprana\s*path\b/,
  /\bpranapath\b/,
  /\bhelp\s+me\b/,
  /\bemergency\b/,
  /\bi\s+am\s+in\s+emergency\b/,
  /\bi\s+m\s+in\s+emergency\b/,
];

const ambulanceIntentPatterns = [
  /\bneed\s+(an\s+)?ambulance\b/,
  /\bbook\s+(an\s+)?ambulance\b/,
  /\bcall\s+(an\s+)?ambulance\b/,
  /\bsend\s+(an\s+)?ambulance\b/,
  /\bambulance\s+please\b/,
  /\bget\s+me\s+an\s+ambulance\b/,
  /\bneed\s+help\s+now\b/,
  /\bplease\s+help\b/,
];

const matchesAnyPattern = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const Home = ({ showToast }) => {
  const navigate = useNavigate();
  const [bloodRequestAlert, setBloodRequestAlert] = useState(null);
  const [volunteerRole, setVolunteerRole] = useState(null);
  const [volunteerActive, setVolunteerActive] = useState(false);
  const [volunteerBusy, setVolunteerBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Tap mic to start emergency voice assistant");

  const recognitionRef = useRef(null);
  const autoRestartRef = useRef(false);
  const wakeWordDetectedRef = useRef(false);
  const voiceBookingInProgressRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const volunteerWatchIdRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    const userId = localStorage.getItem("userId");
    
    // Join user's personal room for notifications
    if (userId) {
      socket.emit("user:join", userId);
    }

    // Listen for blood request notifications
    socket.on("blood:request", (data) => {
      setBloodRequestAlert(data);
      if (showToast) {
        showToast(`Urgent blood request for ${data.bloodGroup}!`, "info");
      }
    });

    socket.on("traffic:roadAlert", () => {
      if (showToast) {
        showToast("🚦 Ambulance approaching your area. Please help clear the road.", "info");
      }
    });

    socket.on("public:emergencyAlert", () => {
      if (showToast) {
        showToast("🚑 Emergency ambulance nearby. Please make way if you are on the route.", "info");
      }
    });

    return () => {
      socket.off("blood:request");
      socket.off("traffic:roadAlert");
      socket.off("public:emergencyAlert");
    };
  }, [showToast]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authFetch("/users/profile");
        if (!res.ok) return;
        const data = await res.json();
        setVolunteerRole(data.volunteerRole || null);
        setVolunteerActive(Boolean(data.volunteerActive));
      } catch (err) {
        console.error("Failed to load volunteer profile:", err);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    if (volunteerRole !== "traffic_volunteer" || !volunteerActive) {
      if (volunteerWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(volunteerWatchIdRef.current);
        volunteerWatchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      showToast?.("Location access is required for traffic volunteer alerts", "error");
      return;
    }

    const pushLocation = async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      try {
        await authFetch("/volunteers/location", {
          method: "PUT",
          body: JSON.stringify({ lat, lng }),
        });
      } catch (err) {
        console.error("Failed to sync traffic volunteer location:", err);
      }
    };

    navigator.geolocation.getCurrentPosition(pushLocation, () => {}, {
      enableHighAccuracy: true,
      timeout: 10000,
    });

    volunteerWatchIdRef.current = navigator.geolocation.watchPosition(
      pushLocation,
      (error) => {
        console.error("Traffic volunteer location watch error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 10000,
      }
    );

    return () => {
      if (volunteerWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(volunteerWatchIdRef.current);
        volunteerWatchIdRef.current = null;
      }
    };
  }, [volunteerRole, volunteerActive, showToast]);

  const handleBloodAlertClick = () => {
    setBloodRequestAlert(null);
    navigate("/bloodhub", { state: { scrollTo: "donations" } });
  };

  const dismissBloodAlert = (e) => {
    e.stopPropagation();
    setBloodRequestAlert(null);
  };

  const joinVolunteer = async (type) => {
    setVolunteerBusy(true);
    try {
      const res = await authFetch("/volunteers/join", {
        method: "POST",
        body: JSON.stringify({ volunteerType: type }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast?.(data.message || "Failed to join volunteer program", "error");
        return;
      }

      setVolunteerRole(type);
      setVolunteerActive(true);
      showToast?.(
        type === "ambulance_volunteer"
          ? "🚑 You are now an ambulance volunteer"
          : "🚦 You are now a traffic volunteer",
        "success"
      );
    } catch (error) {
      showToast?.("Failed to join volunteer program", "error");
    } finally {
      setVolunteerBusy(false);
    }
  };

  const leaveVolunteer = async () => {
    setVolunteerBusy(true);
    try {
      const res = await authFetch("/volunteers/leave", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast?.(data.message || "Failed to leave volunteer program", "error");
        return;
      }

      setVolunteerRole(null);
      setVolunteerActive(false);
      showToast?.("Volunteer mode turned off", "info");
    } catch (error) {
      showToast?.("Failed to leave volunteer program", "error");
    } finally {
      setVolunteerBusy(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    setChatInput("");
    setChatLoading(true);
    setChatMessages((prev) => [...prev, { role: "user", text: trimmed }]);

    try {
      const role = localStorage.getItem("role") || undefined;
      const res = await authFetch("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, role, page: "home" }),
      });
      const data = await res.json();
      const reply = data && data.reply ? data.reply : "Sorry, I am unable to respond right now.";
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I am unable to respond right now." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const speak = (text) => {
    if (!window.speechSynthesis) return;

    // Pause recognition while speaking to prevent TTS audio feeding back into the mic
    isSpeakingRef.current = true;
    if (recognitionRef.current && autoRestartRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 1;
    speech.pitch = 1;
    speech.onend = () => {
      isSpeakingRef.current = false;
      // Resume recognition after TTS finishes
      if (autoRestartRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (!autoRestartRef.current) return;
          try { recognitionRef.current.start(); } catch {}
        }, 300);
      }
    };
    window.speechSynthesis.speak(speech);
  };

  const triggerVoiceEmergencyBooking = () => {
    if (voiceBookingInProgressRef.current) return;

    voiceBookingInProgressRef.current = true;
    setVoiceStatus("Opening voice emergency booking...");

    try {
      if (showToast) {
        showToast("Voice emergency detected. Opening booking page...", "info");
      }

      stopVoiceAssistant();

      navigate("/bookAmbulance", {
        state: {
          voiceEmergency: true,
          emergencyType: "General Visit",
          situation: "Routine Consultation",
          autoBook: true,
        },
      });
    } catch (error) {
      if (showToast) {
        showToast(error.message || "Voice emergency booking failed.", "error");
      }
      setVoiceStatus("Voice emergency request failed. Try again.");
      speak("I could not complete ambulance booking. Please try again.");
    } finally {
      voiceBookingInProgressRef.current = false;
      wakeWordDetectedRef.current = false;
    }
  };

  const startVoiceAssistant = () => {
    if (!recognitionRef.current) {
      if (showToast) showToast("Voice assistant is not supported in this browser.", "error");
      return;
    }

    autoRestartRef.current = true;
    isSpeakingRef.current = false;

    try {
      recognitionRef.current.start();
      // UI state is updated in recognition.onstart once mic is confirmed running
    } catch (error) {
      autoRestartRef.current = false;
      if (showToast) showToast("Unable to start voice assistant. Please try again.", "error");
    }
  };

  const stopVoiceAssistant = () => {
    autoRestartRef.current = false;
    wakeWordDetectedRef.current = false;
    isSpeakingRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    window.speechSynthesis?.cancel();
    setIsVoiceListening(false);
    setIsVoiceModeActive(false);
    setVoiceStatus("Tap mic to start emergency voice assistant");
  };

  const toggleVoiceAssistant = () => {
    if (isVoiceListening) {
      stopVoiceAssistant();
    } else {
      startVoiceAssistant();
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      setVoiceStatus("Voice assistant is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsVoiceListening(true);
      setIsVoiceModeActive(true);
      setVoiceStatus("Voice Emergency Mode Active. Say: Hey Pranapath");
    };

    recognition.onend = () => {
      setIsVoiceListening(false);
      if (autoRestartRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          if (!autoRestartRef.current) return;
          try {
            recognition.start();
          } catch (err) {
            // InvalidStateError means recognition is already running — ignore.
            // Any other error means we can't restart; stop the loop.
            if (err.name !== "InvalidStateError") {
              autoRestartRef.current = false;
              setIsVoiceListening(false);
              setIsVoiceModeActive(false);
              setVoiceStatus("Voice assistant stopped unexpectedly. Tap mic to restart.");
            }
          }
        }, 350);
      } else if (!autoRestartRef.current) {
        setIsVoiceModeActive(false);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceStatus("Microphone permission denied. Allow mic access in browser settings.");
        autoRestartRef.current = false;
        setIsVoiceListening(false);
        setIsVoiceModeActive(false);
      } else if (event.error === "no-speech") {
        setVoiceStatus("Listening... (no speech detected)");
        // autoRestartRef stays true — onend will restart automatically
      } else if (event.error === "network") {
        setVoiceStatus("Network error. Retrying...");
      } else if (event.error === "aborted") {
        // Intentional stop (e.g., while TTS is playing) — no action needed
      } else {
        setVoiceStatus("Voice recognition error. Retrying...");
      }
    };

    recognition.onresult = (event) => {
      const latestTranscript = normalizeTranscript(
        event.results[event.results.length - 1][0].transcript
      );

      if (!latestTranscript) return;

      const userName = localStorage.getItem("username") || localStorage.getItem("name") || "there";

      if (!wakeWordDetectedRef.current && matchesAnyPattern(latestTranscript, wakeWordPatterns)) {
        wakeWordDetectedRef.current = true;
        setVoiceStatus("Listening for ambulance request...");
        speak(`Hi ${userName}, how can I help you?`);
        return;
      }

      if (wakeWordDetectedRef.current && matchesAnyPattern(latestTranscript, ambulanceIntentPatterns)) {
        setVoiceStatus("Emergency intent detected. Booking now.");
        triggerVoiceEmergencyBooking();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      autoRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Donor notification on home page
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
      // Fetch pending requests
      let pending = [];
      try {
        const res = await authFetch("/blood/pending");
        const data = await res.json();
        if (res.ok && Array.isArray(data)) pending = data;
      } catch {}
      // Check for matching pending requests
      if (pending.some(r => r.bloodGroup === bloodGroup)) {
        if (showToast) {
          showToast(
            <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={() => navigate("/bloodhub", { state: { scrollTo: "donations" } })}>
              You have new blood requests matching your group! Click here to view
            </span>,
            "info"
          );
        }
      }
    }
    notifyDonorIfNeeded();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="home-container">
      {isVoiceModeActive && (
        <div className="voice-mode-banner" role="status" aria-live="polite">
          🚨 Voice Emergency Mode Active
          <span>{voiceStatus}</span>
        </div>
      )}

      {/* Blood Request Alert Banner */}
      {bloodRequestAlert && (
        <div className="blood-request-banner" onClick={handleBloodAlertClick}>
          <i className="fa-solid fa-droplet"></i>
          <span>
            🩸 Urgent: {bloodRequestAlert.bloodGroup} blood needed at {bloodRequestAlert.hospital}!
            Click to donate
          </span>
          <button className="close-banner" onClick={dismissBloodAlert}>
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="emergency-badge">🚨 24/7 Emergency Service</div>
          <h1 className="hero-title">
            <span className="title-line">Fast</span>
            <span className="title-line">Reliable</span>
            <span className="title-line">Life Saving</span>
          </h1>
          <p className="hero-subtitle">
            Your emergency response partner, just a click away
          </p>
          <div className="cta-buttons-container">
            <Link to="/bookambulance" className="cta-button">
              Book Ambulance Now
            </Link>
            <Link to="/bloodhub" className="cta-button blood-hub-btn">
              <i className="fa-solid fa-droplet"></i> Blood Hub
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="pulse-ring"></div>
          {/* Font Awesome icon for the main visual */}
          <div className="ambulance-icon"><i className="fa-solid fa-truck-medical"></i></div>
          <button
            type="button"
            className="chatbot-bubble"
            aria-label="Open Pranapath AI Assistant"
            onClick={() => setChatOpen(true)}
          >
            <img src={chatbotIcon} alt="" className="chatbot-bubble-image" />
          </button>

          <button
            type="button"
            className={`voice-assistant-btn ${isVoiceListening ? "listening" : ""}`}
            onClick={toggleVoiceAssistant}
            aria-label={isVoiceListening ? "Stop Voice Emergency Assistant" : "Start Voice Emergency Assistant"}
            title={voiceSupported ? "Voice Emergency Assistant" : "Voice assistant not supported"}
            disabled={!voiceSupported}
          >
            {isVoiceListening ? "🛑" : "🎤"}
          </button>
        </div>
      </section>

      <section className="volunteer-section">
        <div className="volunteer-section-header">
          <span className="volunteer-kicker">Community Response Network</span>
          <h2 className="section-title volunteer-title-text">Volunteer to Reduce Response Time</h2>
          <p className="volunteer-copy">
            Choose how you want to help. Ambulance volunteers can respond to nearby emergency bookings.
            Traffic volunteers receive live alerts when an ambulance route passes close to them.
          </p>
        </div>

        <div className="volunteer-cards">
          <div className={`volunteer-card ${volunteerRole === "ambulance_volunteer" ? "active" : ""}`}>
            <div className="volunteer-card-icon ambulance">🚑</div>
            <h3>Ambulance Volunteer</h3>
            <p>
              Accept emergency pickup requests within 15 km when a faster backup response is needed.
            </p>
            <div className="volunteer-card-meta">Role status: {volunteerRole === "ambulance_volunteer" && volunteerActive ? "Active" : "Available to join"}</div>
            <div className="volunteer-card-actions">
              {volunteerRole === "ambulance_volunteer" && volunteerActive ? (
                <>
                  <button className="volunteer-dashboard-btn" onClick={() => navigate("/volunteer")}>
                    Open Volunteer Dashboard
                  </button>
                  <button className="volunteer-leave-btn" onClick={leaveVolunteer} disabled={volunteerBusy}>
                    Leave Program
                  </button>
                </>
              ) : (
                <button
                  className="volunteer-join-btn"
                  onClick={() => joinVolunteer("ambulance_volunteer")}
                  disabled={volunteerBusy || (volunteerActive && volunteerRole !== "ambulance_volunteer")}
                >
                  Join as Ambulance Volunteer
                </button>
              )}
            </div>
          </div>

          <div className={`volunteer-card ${volunteerRole === "traffic_volunteer" ? "active" : ""}`}>
            <div className="volunteer-card-icon traffic">🚦</div>
            <h3>Traffic Volunteer</h3>
            <p>
              Receive route alerts when an ambulance is within 800 meters so you can help clear the road.
            </p>
            <div className="volunteer-card-meta">Role status: {volunteerRole === "traffic_volunteer" && volunteerActive ? "Active" : "Available to join"}</div>
            <div className="volunteer-card-actions">
              {volunteerRole === "traffic_volunteer" && volunteerActive ? (
                <button className="volunteer-leave-btn" onClick={leaveVolunteer} disabled={volunteerBusy}>
                  Leave Program
                </button>
              ) : (
                <button
                  className="volunteer-join-btn traffic"
                  onClick={() => joinVolunteer("traffic_volunteer")}
                  disabled={volunteerBusy || (volunteerActive && volunteerRole !== "traffic_volunteer")}
                >
                  Join as Traffic Volunteer
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {chatOpen && (
        <div className="chat-panel" role="dialog" aria-label="Smart-Ambulance AI Assistant">
          <div className="chat-panel-header">
            <span>Smart-Ambulance AI Assistant</span>
            <button
              type="button"
              className="chat-panel-close"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>
          <div className="chat-panel-body">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">Ask about Pranapath features or how to use the app.</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`chat-message ${msg.role}`}
                >
                  {msg.text}
                </div>
              ))
            )}
            {chatLoading && <div className="chat-message assistant">Typing...</div>}
          </div>
          <form className="chat-panel-input" onSubmit={handleChatSubmit}>
            <input
              type="text"
              placeholder="Type your question..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      {/* Features Section (Icons were updated previously) */}
      <section className="features">
        <h2 className="section-title">Why Us?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-bolt"></i></div>
            <h3>Instant Booking</h3>
            <p>
              Book an ambulance in under 30 seconds with our streamlined process
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-location-dot"></i></div>
            <h3>Real-Time Tracking</h3>
            <p>
              Track your ambulance location live on the map from dispatch to
              arrival
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-hospital"></i></div>
            <h3>Hospital Network</h3>
            <p>
              Connected to the hospitals for seamless emergency care
              coordination
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-sack-dollar"></i></div>
            <h3>Transparent Pricing</h3>
            <p>
              No hidden charges. Clear pricing displayed before confirmation
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-stethoscope"></i></div>
            <h3>Medical Support</h3>
            <p>
              All ambulances equipped with essential life saving medical
              equipment
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><i className="fa-solid fa-lock"></i></div>
            <h3>Secure & Private</h3>
            <p>
              Your medical information is encrypted and completely confidential
            </p>
          </div>
        </div>
      </section>

      {/* 🟢 RESTORED & UPDATED: How It Works Section */}
      <section className="how-it-works">
        <h2 className="section-title">How to Use?</h2>
        <div className="steps-container">
          <div className="step">
            {/* Font Awesome icon for Step 1 */}
            <div className="step-number"><i className="fa-solid fa-map-location-dot"></i></div>
            <div className="step-content">
              <h3>Enter Location</h3>
              <p>
                Provide your pickup and destination details via map or manual entry
              </p>
            </div>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            {/* Font Awesome icon for Step 2 */}
            <div className="step-number"><i className="fa-solid fa-truck-medical"></i></div>
            <div className="step-content">
              <h3>Check Details</h3>
              <p>
                Review your information to ensure everything is correct before booking
              </p>
            </div>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            {/* Font Awesome icon for Step 3 */}
            <div className="step-number"><i className="fa-solid fa-check"></i></div>
            <div className="step-content">
              <h3>Confirm Booking</h3>
              <p>
                Click ‘Book Now’ to instantly confirm your ambulance request and get help on the way
              </p>
            </div>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            {/* Font Awesome icon for Step 4 */}
            <div className="step-number"><i className="fa-solid fa-route"></i></div>
            <div className="step-content">
              <h3>Track & Arrive</h3>
              <p>
                Track ambulance in real time. Driver will contact you upon
                arrival
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* 🟢 END RESTORED & UPDATED SECTION */}

      {/* Our Drivers Section (Icons were updated previously) */}
      <section className="our-team">
        <h2 className="section-title">Our Drivers</h2>
        <p className="section-subtitle">
          Trained professionals committed to saving lives
        </p>
        <div className="team-grid">
          <div className="team-card">
            <div className="team-icon"><i className="fa-solid fa-user"></i></div>
            <h3>Certified Professionals</h3>
            <p>
              All drivers are certified EMTs with advanced life support training
            </p>
          </div>
          <div className="team-card">
            <div className="team-icon"><i className="fa-solid fa-compass"></i></div>
            <h3>Expert Navigation</h3>
            <p>
              Experienced in finding fastest routes during critical emergencies
            </p>
          </div>
          <div className="team-card">
            <div className="team-icon"><i className="fa-solid fa-hand-holding-medical"></i></div>
            <h3>Compassionate Care</h3>
            <p>
              Trained to provide emotional support and reassurance during
              transport
            </p>
          </div>
          <div className="team-card">
            <div className="team-icon"><i className="fa-solid fa-headset"></i></div>
            <h3>24/7 Availability</h3>
            <p>Round-the-clock driver network ready to respond at any moment</p>
          </div>
        </div>
      </section>

      {/* Our Police Section (Icons were updated previously) */}
      <section className="our-police">
        <h2 className="section-title">Our Police Partnership</h2>
        <p className="section-subtitle">Coordinated response for your safety</p>
        <div className="police-grid">
          <div className="police-card">
            <div className="police-icon"><i className="fa-solid fa-siren-on"></i></div>
            <h3>Emergency Escort</h3>
            <p>
              Police escort available for critical cases requiring traffic
              clearance
            </p>
          </div>
          <div className="police-card">
            <div className="police-icon"><i className="fa-solid fa-shield-halved"></i></div>
            <h3>Safe Transport</h3>
            <p>
              Enhanced security for patient safety in sensitive or high-risk
              situations
            </p>
          </div>
          <div className="police-card">
            <div className="police-icon"><i className="fa-solid fa-satellite-dish"></i></div>
            <h3>Direct Communication</h3>
            <p>
              Integrated system for instant police coordination during
              emergencies
            </p>
          </div>
          <div className="police-card">
            <div className="police-icon"><i className="fa-solid fa-scale-balanced"></i></div>
            <h3>Legal Support</h3>
            <p>
              Assistance with accident documentation and legal requirements
            </p>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="footer-cta">
        <h2>Ready to Get Started?</h2>
        <p>Emergency medical help is just one click away</p>
        <div className="footer-cta-buttons">
          <Link to="/bookambulance" className="cta-button-large">
            Book Your Ambulance Now
          </Link>
          <Link to="/bloodhub" className="cta-button-large blood-hub-footer-btn">
            <i className="fa-solid fa-droplet"></i> Blood Hub
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;