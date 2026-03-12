import { useState, useRef, useEffect } from "react";
import "../styles/help.css";

// Decision tree structure for chatbot
const chatbotTree = {
  root: {
    message: "Hello! I'm here to help. What do you need assistance with?",
    options: [
      { label: "Booking Issues", next: "booking" },
      { label: "Tracking Problems", next: "tracking" },
      { label: "Account & Login", next: "account" },
      { label: "App & Technical Issues", next: "technical" },
      { label: "Emergency Help", next: "emergency" },
    ],
  },
  booking: {
    message: "I can help with booking issues. What's the problem?",
    options: [
      { label: "Can't find ambulance", next: "booking_no_ambulance" },
      { label: "Booking got cancelled", next: "booking_cancelled" },
      { label: "How to book an ambulance", next: "booking_how" },
      { label: "Location not detected", next: "booking_location" },
      { label: "Go back", next: "root" },
    ],
  },
  booking_no_ambulance: {
    message: "If no ambulance is found, it means all drivers are currently busy. Here's what you can do:",
    solution: [
      "1. Wait for 1-2 minutes and try booking again",
      "2. Ensure your location is correctly set",
      "3. Try expanding the search area by adjusting your pickup location slightly",
      "4. In emergencies, call local emergency services (108) directly",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  booking_cancelled: {
    message: "Bookings can get cancelled for various reasons. Here's how to resolve:",
    solution: [
      "1. If the driver cancelled, you can rebook immediately",
      "2. Check your internet connection and try again",
      "3. Ensure your pickup location is accessible",
      "4. If issue persists, contact support via Contact Us page",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  booking_how: {
    message: "Here's how to book an ambulance:",
    solution: [
      "1. Go to 'Book Ambulance' from the navigation menu",
      "2. Allow location access or enter pickup location manually",
      "3. Enter your destination hospital",
      "4. Click 'Book Now' and wait for driver assignment",
      "5. Once assigned, you'll see driver details and can track live",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  booking_location: {
    message: "Location detection issues can be fixed by:",
    solution: [
      "1. Enable GPS/Location services on your device",
      "2. Allow browser to access your location when prompted",
      "3. Use 'Enter location manually' option as alternative",
      "4. Clear browser cache and refresh the page",
      "5. Try using a different browser if issue persists",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  tracking: {
    message: "What tracking issue are you facing?",
    options: [
      { label: "Can't see driver location", next: "tracking_no_driver" },
      { label: "Map not loading", next: "tracking_map" },
      { label: "Wrong ETA shown", next: "tracking_eta" },
      { label: "Go back", next: "root" },
    ],
  },
  tracking_no_driver: {
    message: "If you can't see the driver's location:",
    solution: [
      "1. Ensure your booking is in 'Accepted' status",
      "2. Check your internet connection",
      "3. Refresh the tracking page",
      "4. The driver may be in an area with poor GPS signal",
      "5. Contact the driver directly using the call button",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  tracking_map: {
    message: "If the map isn't loading properly:",
    solution: [
      "1. Check your internet connection",
      "2. Refresh the page (Ctrl+R or pull down on mobile)",
      "3. Clear browser cache and cookies",
      "4. Disable any ad-blockers temporarily",
      "5. Try using a different browser",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  tracking_eta: {
    message: "ETA is estimated based on current traffic. Here's why it might vary:",
    solution: [
      "1. ETA updates in real-time based on traffic conditions",
      "2. Actual arrival may differ due to road conditions",
      "3. The driver may take a different route for faster arrival",
      "4. ETA refreshes every few seconds automatically",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  account: {
    message: "What account issue do you need help with?",
    options: [
      { label: "Can't login", next: "account_login" },
      { label: "Forgot password", next: "account_password" },
      { label: "Update profile", next: "account_profile" },
      { label: "Go back", next: "root" },
    ],
  },
  account_login: {
    message: "If you're having trouble logging in:",
    solution: [
      "1. Double-check your email and password",
      "2. Ensure Caps Lock is not enabled",
      "3. Try resetting your password",
      "4. Clear browser cookies and try again",
      "5. Contact support if account is locked",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  account_password: {
    message: "To reset your password:",
    solution: [
      "1. Go to the login page",
      "2. Click on 'Forgot Password' link",
      "3. Enter your registered email address",
      "4. Check your email for reset instructions",
      "5. Create a new strong password",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  account_profile: {
    message: "To update your profile:",
    solution: [
      "1. Login to your account",
      "2. Click on 'Profile' in the navigation menu",
      "3. Edit your details (name, phone, etc.)",
      "4. Click 'Save' to update your information",
      "5. Some fields may require verification",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  technical: {
    message: "What technical issue are you experiencing?",
    options: [
      { label: "App not loading", next: "technical_loading" },
      { label: "Notifications not working", next: "technical_notifications" },
      { label: "GPS/Location issues", next: "technical_gps" },
      { label: "Go back", next: "root" },
    ],
  },
  technical_loading: {
    message: "If the app is not loading properly:",
    solution: [
      "1. Check your internet connection",
      "2. Clear browser cache and cookies",
      "3. Try refreshing the page (Ctrl+R)",
      "4. Disable browser extensions temporarily",
      "5. Try using a different browser",
      "6. If on mobile, try restarting your device",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  technical_notifications: {
    message: "To fix notification issues:",
    solution: [
      "1. Allow notifications in browser settings",
      "2. Check if 'Do Not Disturb' mode is off",
      "3. Ensure the browser tab is not muted",
      "4. Keep the app tab open for real-time updates",
      "5. Check notification settings in your device",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  technical_gps: {
    message: "To resolve GPS/Location issues:",
    solution: [
      "1. Enable location services on your device",
      "2. Allow browser to access your location",
      "3. Check if GPS signal is strong (go outdoors)",
      "4. Restart your browser and try again",
      "5. Use 'Enter manually' option as alternative",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  emergency: {
    message: "What kind of emergency help do you need?",
    options: [
      { label: "Need ambulance urgently", next: "emergency_urgent" },
      { label: "Ambulance is delayed", next: "emergency_delayed" },
      { label: "Medical emergency tips", next: "emergency_tips" },
      { label: "Go back", next: "root" },
    ],
  },
  emergency_urgent: {
    message: "For urgent ambulance needs:",
    solution: [
      "1. Book immediately through 'Book Ambulance'",
      "2. Enable location for fastest response",
      "3. If app fails, call emergency services: 108",
      "4. Keep patient calm and comfortable",
      "5. Note any symptoms to tell the paramedics",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  emergency_delayed: {
    message: "If your ambulance is delayed:",
    solution: [
      "1. Check live tracking for driver's location",
      "2. Call the driver using the contact button",
      "3. Traffic or road conditions may cause delays",
      "4. If critical, call 108 for backup ambulance",
      "5. Stay at pickup location for easy spotting",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
  emergency_tips: {
    message: "While waiting for the ambulance:",
    solution: [
      "1. Keep the patient calm and still",
      "2. Don't give food or water if unconscious",
      "3. Loosen tight clothing",
      "4. If bleeding, apply gentle pressure",
      "5. Note time of symptoms onset",
      "6. Keep medications list ready for paramedics",
    ],
    options: [{ label: "Back to main menu", next: "root" }],
  },
};

// FAQ data
const faqs = [
  {
    question: "How do I book an ambulance?",
    answer:
      "Go to 'Book Ambulance' from the menu, allow location access or enter your pickup location manually, enter your destination hospital, and click 'Book Now'. The system will search for available drivers within 15km of your location.",
  },
  {
    question: "How can I cancel my booking?",
    answer:
      "You can cancel your booking at any time before the ride is completed. During the search phase, click 'Cancel Booking' on the searching overlay. After a driver is assigned, you can cancel from the Live Tracking page. The driver will be notified immediately about the cancellation.",
  },
  {
    question: "What happens if no driver is found?",
    answer:
      "The system searches for available drivers for 90 seconds. If no driver accepts your booking within this time, you'll see a 'No Drivers Available' message. You can try booking again or call emergency services directly.",
  },
  {
    question: "How do I track my ambulance in real-time?",
    answer:
      "Once a driver accepts your booking, you'll be automatically redirected to the Live Tracking page where you can see the driver's real-time location, estimated arrival time, and route on the map.",
  },
  {
    question: "Why are police notified about my booking?",
    answer:
      "When a driver accepts your booking, nearby police officers along the ambulance route are automatically alerted. This helps with traffic coordination and ensures the ambulance can reach you faster.",
  },
  {
    question: "How do drivers get assigned to my booking?",
    answer:
      "When you book an ambulance, all on-duty drivers within 15km of your pickup location are notified. The first driver to accept your request gets assigned to your booking.",
  },
];

function Help() {
  const [messages, setMessages] = useState([
    { type: "bot", content: chatbotTree.root.message, options: chatbotTree.root.options },
  ]);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const chatWindowRef = useRef(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const handleOptionClick = (option) => {
    // Add user's selection as a message
    setMessages((prev) => [...prev, { type: "user", content: option.label }]);

    // Get next node from tree
    const nextNode = chatbotTree[option.next];

    // Build bot response
    setTimeout(() => {
      const botMessage = {
        type: "bot",
        content: nextNode.message,
        solution: nextNode.solution || null,
        options: nextNode.options,
      };
      setMessages((prev) => [...prev, botMessage]);
    }, 300);
  };

  const resetChat = () => {
    setMessages([
      { type: "bot", content: chatbotTree.root.message, options: chatbotTree.root.options },
    ]);
  };

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  return (
    <div className="help-page">
      <h1>Help & Support</h1>
      <br></br>
      
      <div className="help-content">
        {/* FAQ Section */}
        <section className="faq-section">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className={`faq-item ${expandedFaq === index ? "expanded" : ""}`}
              >
                <button className="faq-question" onClick={() => toggleFaq(index)}>
                  <span>{faq.question}</span>
                  <span className="faq-icon">{expandedFaq === index ? "−" : "+"}</span>
                </button>
                {expandedFaq === index && (
                  <div className="faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Chatbot Section */}
        <section className="chatbot-section">
          <h2 className="section-title">Chat Support</h2>
        <div className="chatbot-container">
          <div className="chatbot-header">
            <div className="chatbot-avatar">🤖</div>
            <div>
              <h3>Support Assistant</h3>
              <p>Select an option to get help</p>
            </div>
            <button className="reset-btn" onClick={resetChat} title="Start over">
              ↺
            </button>
          </div>

          <div className="chat-window" ref={chatWindowRef}>
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.type}`}>
                {msg.type === "bot" && <div className="bot-avatar">🤖</div>}
                <div className="message-content">
                  <p>{msg.content}</p>
                  
                  {/* Show solution steps if available */}
                  {msg.solution && (
                    <div className="solution-box">
                      {msg.solution.map((step, i) => (
                        <p key={i} className="solution-step">{step}</p>
                      ))}
                    </div>
                  )}

                  {/* Show options for the latest bot message */}
                  {msg.type === "bot" && index === messages.length - 1 && msg.options && (
                    <div className="options-container">
                      {msg.options.map((option, i) => (
                        <button
                          key={i}
                          className="option-btn"
                          onClick={() => handleOptionClick(option)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}

export default Help;
