process.env.NODE_OPTIONS = "--dns-result-order=ipv4first";
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Initialize Firebase Admin (must be required early)
require("./config/firebase");

const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookingRoutes");
const policeRoutes = require("./routes/policeRoutes");
const userRoutes = require("./routes/userRoutes");
const bloodRoutes = require("./routes/bloodRoutes");
const aiRoutes = require("./routes/aiRoutes");
const volunteerRoutes = require("./routes/volunteerRoutes");
const { distanceInMeters } = require("./utils/geoUtils");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");

const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

// Get allowed origins from environment or use defaults
const getAllowedOrigins = () => {
  const origins = ["http://localhost:3000"];
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
  if (process.env.VERCEL_FRONTEND_URL) origins.push(process.env.VERCEL_FRONTEND_URL);
  // origins.push("https://smart-ambulance-dun.vercel.app");
  return [...new Set(origins)];
};

const allowedOrigins = getAllowedOrigins();
console.log("Allowed CORS origins:", allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

// expose io to routes/controllers
app.set("io", io);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Smart Ambulance backend is running." });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/police", policeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/blood", bloodRoutes);
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/hospitals", require("./routes/hospitalRoutes"));


// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Socket.io handlers
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  // Client subscribes to a booking room
  socket.on("booking:subscribe", ({ bookingId, role }) => {
    if (!bookingId) return;
    const room = `booking:${bookingId}`;
    socket.join(room);
    console.log(`📦 ${role} joined ${room}`);
  });

  // Police joins OWN room
  socket.on("police:join", (policeId) => {
    if (!policeId) return;
    socket.join(`police:${policeId}`);
    console.log(`👮 Police joined room police:${policeId}`);
  });

  // User joins OWN room (for blood notifications)
  socket.on("user:join", (userId) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`👤 User joined room user:${userId}`);
  });

// ── Ambulance movement monitoring ────────────────────────────────────────────
// Tracks recent driver positions per booking, detects "stuck" ambulances,
// and notifies all parties so they can find an alternative.
const ambulancePositions = new Map(); // bookingId → [{lat, lng, ts}]
const stuckBookings = new Set();     // bookingIds already flagged as stuck

  // Driver shares live location
  socket.on("driver:location", ({ bookingId, lat, lng }) => {
    if (!bookingId || typeof lat !== "number" || typeof lng !== "number") return;
    io.to(`booking:${bookingId}`).emit("driver:location", { lat, lng, timestamp: Date.now() });

    // --- Movement monitoring ---
    const history = ambulancePositions.get(bookingId) || [];
    const now = Date.now();
    history.push({ lat, lng, ts: now });

    // Keep only the last 2 minutes of positions
    const trimmed = history.filter((p) => now - p.ts <= 120_000);
    ambulancePositions.set(bookingId, trimmed);

    if (stuckBookings.has(bookingId)) return; // already flagged

    // Check if ambulance has moved < 20 m in the last 60 s
    const cutoff = now - 60_000;
    const recent = trimmed.filter((p) => p.ts >= cutoff);
    if (recent.length < 2) return;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const moved = distanceInMeters(first.lat, first.lng, last.lat, last.lng);

    if (moved < 20) {
      stuckBookings.add(bookingId);
      console.warn(`⚠️  Ambulance for booking ${bookingId} may be stuck (moved ${moved.toFixed(1)} m in 60 s)`);

      io.to(`booking:${bookingId}`).emit("ambulance:stuck", {
        bookingId,
        movedMeters: Math.round(moved),
        message: "⚠️ Ambulance may be stuck in traffic. Searching for alternatives...",
      });

      // After 90 more seconds check again; if still stuck, trigger reassignment search
      setTimeout(() => {
        const latest = ambulancePositions.get(bookingId) || [];
        const nowCheck = Date.now();
        const veryRecent = latest.filter((p) => nowCheck - p.ts <= 60_000);

        let stillStuck = false;
        if (veryRecent.length >= 2) {
          const a = veryRecent[0];
          const b = veryRecent[veryRecent.length - 1];
          stillStuck = distanceInMeters(a.lat, a.lng, b.lat, b.lng) < 20;
        }

        if (stillStuck) {
          console.warn(`🔄 Booking ${bookingId} still stuck after 90 s — requesting reassignment`);
          io.to(`booking:${bookingId}`).emit("ambulance:reassigning", {
            bookingId,
            message: "🔄 Still delayed. Searching for a faster ambulance...",
          });
        } else {
          // Ambulance is moving again, clear the stuck flag
          stuckBookings.delete(bookingId);
        }
      }, 90_000);
    }
  });

  // User shares live location
  socket.on("user:location", ({ bookingId, lat, lng }) => {
    if (!bookingId || typeof lat !== "number" || typeof lng !== "number") return;
    io.to(`booking:${bookingId}`).emit("user:location", { lat, lng, timestamp: Date.now() });
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
