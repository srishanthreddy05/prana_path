# Smart Ambulance

A production-ready full-stack emergency response platform that connects users requesting emergency medical services with available drivers and alerts nearby police for critical incidents.

---

## 1. Project Overview

### Problem Statement
Emergency medical services face critical delays due to:
- Inefficient dispatch systems
- Poor real-time communication between responders
- Limited situational awareness for police and medical teams
- Lack of integrated location tracking

### Solution
Smart Ambulance provides a unified platform where:
- **Users** can request ambulances in real-time with GPS location
- **Drivers** receive bookings, track routes, and update status in real-time
- **Police** are alerted to critical incidents and can monitor ambulance locations
- All parties communicate seamlessly with live location tracking

### Real-World Use Cases
1. **Emergency Medical Response**: User dials for ambulance, nearest available driver accepts, police are notified for traffic management
2. **Blood Donation Network**: Users can request blood, donors can respond, hospitals can track deliveries
3. **Critical Incident Coordination**: Police are instantly alerted to emergencies in their jurisdiction
4. **Live Tracking**: Hospitals and police can monitor ambulance arrival in real-time

### Key Features
- Real-time booking and acceptance
- Live location tracking with Google Maps integration
- OTP-based secure signup
- JWT authentication with role-based access
- Socket.io powered live notifications
- Email notifications via Brevo API
- Multi-role system (User, Driver, Police)
- Geospatial queries for nearest driver matching
- Blood donation request management

---

## 2. Tech Stack

### Frontend
- **Framework**: React 19.1.1
- **Build Tool**: Create React App (Webpack)
- **Routing**: React Router 7.8.2
- **Deployment**: Vercel (automatic CI/CD from Git)
- **Maps**: Google Maps API, Geoapify

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Real-time**: Socket.io
- **Deployment**: Render (free tier, auto-redeploy on push)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs

### Database
- **Primary**: MongoDB Atlas (cloud-hosted)
- **Collections**: Users, Bookings, OTPs, PoliceLocations, BloodRequests

### Third-Party APIs & Services
- **Email**: Brevo (HTTP Email API for OTP, forgot password)
- **Maps**: Google Maps (geocoding, directions)
- **Geolocation**: Geoapify (alternative geocoding)
- **Hosting**: Vercel (frontend), Render (backend)

### Development Tools
- **Linting**: ESLint
- **Package Manager**: npm
- **Version Control**: Git/GitHub

---

## 3. System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vercel)                       │
│                    React + React Router                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Components: UserHome, DriverDashboard, PoliceDashboard   │  │
│  │ Services: authFetch, bookingService, locationService    │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS REST API
                       │ Socket.io WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (Render / Node.js)                    │
│                      Express + Socket.io                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Routes: /api/auth, /api/bookings, /api/users, /api/police│  │
│  │ Controllers: authController, bookingController, etc.     │  │
│  │ Middleware: authMiddleware, errorMiddleware              │  │
│  │ Socket Handlers: connection, booking updates, locations  │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ MongoDB Driver
                       ▼
            ┌──────────────────────────────┐
            │   MongoDB Atlas (Cloud)      │
            │  - Users                     │
            │  - Bookings                  │
            │  - OTPs                      │
            │  - PoliceLocations           │
            │  - BloodRequests             │
            └──────────────────────────────┘

           External Services:
           - Brevo (HTTP Email API)
           - Google Maps API
           - Geoapify API
```

### Request Flow

1. **Frontend Request**:
   - `authFetch(path, options)` adds JWT token to Authorization header
   - Sends request to `REACT_APP_API_BASE_URL/api/{path}`
   - For example: `authFetch("/bookings")` → `https://backend/api/bookings`

2. **Backend Processing**:
   - Express receives request at `/api/{path}`
   - `authMiddleware` validates JWT token
   - Controller processes business logic
   - Response sent back to frontend

3. **Real-Time Updates**:
   - Socket.io connection established after login
   - Server emits events to specific rooms (e.g., `booking-${bookingId}`)
   - Frontend listens and updates UI without polling

### Authentication Flow

```
User Signs Up
    ↓
Frontend sends email to /api/auth/signup/send-otp
    ↓
Backend generates 6-digit OTP, hashes it, stores in OTP collection (5 min expiry)
    ↓
Brevo sends OTP via email
    ↓
User enters OTP in frontend
    ↓
Frontend sends OTP to /api/auth/signup/verify-otp
    ↓
Backend compares OTP hash, marks user as verified, deletes OTP
    ↓
User sets password via /api/auth/signup/set-password
    ↓
User logs in via /api/auth/login
    ↓
Backend validates credentials, generates JWT token (7 days expiry)
    ↓
Frontend stores token in localStorage, sets Authorization header for all requests
```

---

## 4. User Roles & Permissions

### Role: User
- **Who**: Emergency service requester
- **Can Do**:
  - Sign up with OTP verification
  - View profile
  - Request ambulance (create booking)
  - View booking status in real-time
  - Track driver location live
  - Cancel booking
  - Request blood donation
  - View pending blood requests

### Role: Driver
- **Who**: Ambulance driver
- **Can Do**:
  - Sign up and verify profile (vehicle info, license)
  - View pending bookings in their area
  - Accept/reject bookings
  - Update on-duty status
  - Share live location with users
  - Mark booking as complete or cancel
  - View booking history

### Role: Police
- **Who**: Traffic police officer
- **Can Do**:
  - Sign up and verify profile
  - View active bookings in their jurisdiction
  - Share location (tracked by system)
  - View driver and ambulance locations in real-time
  - Receive alerts for critical incidents
  - View booking details

### Access Control
- Routes are protected by `authMiddleware` which validates JWT
- Role-specific endpoints check `user.role` before allowing access
- Frontend conditionally renders pages based on `user.role`

---

## 5. Authentication & Security

### Signup Flow (OTP-Based)

1. User enters email → `POST /api/auth/signup/send-otp`
2. Backend:
   - Checks if email already registered
   - Generates random 6-digit OTP
   - Hashes OTP using bcryptjs
   - Stores hash in OTP collection with 5-minute expiry
   - Calls Brevo API to send email
3. Frontend displays OTP input
4. User enters OTP → `POST /api/auth/signup/verify-otp`
5. Backend:
   - Retrieves OTP record
   - Compares user's OTP with stored hash
   - If match: marks user as verified, deletes OTP
   - Returns success message
6. User sets password → `POST /api/auth/signup/set-password`
7. Backend:
   - Hashes password with bcryptjs
   - Stores user in database
   - Returns success

### Login Flow

1. User enters email & password → `POST /api/auth/login`
2. Backend:
   - Finds user by email
   - Compares password with bcrypt
   - If match: generates JWT token with `{ id, role }` payload
   - Returns token
3. Frontend stores token in `localStorage` as key `token`
4. All subsequent requests include header: `Authorization: Bearer {token}`

### Forgot Password Flow

1. User clicks "Forgot Password" → `POST /api/auth/forgot-password`
2. Backend:
   - Finds user by email (if exists)
   - Generates random reset token
   - Hashes token with SHA256
   - Stores hash + 15-minute expiry in user record
   - Calls Brevo to send reset link email
   - Returns generic success message (no enumeration)
3. User receives email with reset link containing token
4. User clicks link → Frontend shows reset password form
5. User enters new password → `POST /api/auth/reset-password/:token`
6. Backend:
   - Verifies token hasn't expired
   - Hashes new password
   - Clears reset token from user record
   - Returns success

### JWT Handling

- **Token Generation**: `jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" })`
- **Token Storage**: `localStorage.setItem("token", token)` (frontend)
- **Token Usage**: Every request includes `Authorization: Bearer {token}` header
- **Token Validation**: `authMiddleware` verifies token signature and expiry
- **Auto-Logout**: Token expiry is handled client-side; when expired, user is redirected to login

### Security Best Practices Implemented

1. **Password Hashing**: bcryptjs with salt rounds = 10
2. **OTP Security**: 
   - OTPs are hashed in database (never stored plaintext)
   - Max 3 incorrect attempts before requiring new OTP
   - 5-minute expiry
3. **JWT Security**:
   - Signed with strong secret
   - Contains minimal payload (id, role)
   - 7-day expiry
   - Transmitted only over HTTPS in production
4. **Token Storage**: localStorage (alternative: httpOnly cookies for enhanced security)
5. **CORS**: Dynamically configured to allow only Vercel frontend domain
6. **HTTPS**: Enforced in production (Render, Vercel)
7. **Environment Variables**: Sensitive data (API keys, secrets) never committed to Git

---

## 6. OTP & Email System

### Why Brevo HTTP Email API?

**Problem**: SMTP is often blocked on serverless platforms (Render) due to:
- Port 587/465 restrictions
- Reputation/spam filtering
- Rate limiting

**Solution**: Brevo HTTP Email API provides:
- HTTPS delivery (no port restrictions)
- Reliable transactional email sending
- Built-in bounce/complaint handling
- Production-grade uptime SLA

### OTP System

**Generation**:
```javascript
const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
const otpHash = await bcrypt.hash(otp, 10); // Hash for storage
```

**Storage**:
- Stored in `Otp` collection with fields:
  - `email`: User's email
  - `otpHash`: Bcrypt-hashed OTP
  - `expiresAt`: Current time + 5 minutes
  - `attempts`: Attempt counter (max 3)

**Validation**:
- User submits OTP
- Backend compares plaintext OTP with stored hash using bcrypt.compare()
- If match and not expired: OTP deleted, user verified
- If mismatch: attempts incremented; user locked out after 3 attempts

### Email Sending (Brevo HTTP API)

**Endpoint**: `POST https://api.brevo.com/v3/smtp/email`

**Headers**:
```javascript
{
  "api-key": process.env.BREVO_API_KEY,  // Must start with "xkeysib-"
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

**Payload**:
```javascript
{
  "sender": { 
    "email": "smartambulance.in@gmail.com",
    "name": "Smart Ambulance"
  },
  "to": [{ "email": "user@example.com" }],
  "subject": "Your Smart Ambulance verification code",
  "htmlContent": "<p>Your OTP is <strong>123456</strong>. It expires in 5 minutes.</p>"
}
```

**Response Handling**:
- 200: Email queued successfully
- 401: Invalid API key (must be `xkeysib-`, not SMTP key)
- 403: Sender not verified in Brevo

### Forgot Password Email Flow

1. User requests reset → Backend generates reset token
2. Token hashed and stored in user record with 15-minute expiry
3. Brevo sends email with reset link:
   ```
   https://frontend/reset-password/{token}?email={email}
   ```
4. User clicks link → Frontend shows password reset form
5. User submits new password + token → Backend validates and updates

### Production Considerations

1. **Sender Verification**: `FROM_EMAIL` must be verified in Brevo dashboard
2. **Rate Limiting**: Brevo enforces rate limits; implement retry logic with exponential backoff
3. **Bounce Handling**: Monitor Brevo webhooks for bounces and unsubscribes
4. **Logging**: All email sends are logged with recipient and status
5. **Confirmation Emails**: Secondary confirmation to developer email is best-effort (failures logged, not thrown)

---

## 7. API Documentation

### Authentication Endpoints

#### 1. Send OTP
```http
POST /api/auth/signup/send-otp
Content-Type: application/json

{
  "email": "user@example.com"
}

Response 200:
{
  "message": "OTP sent"
}

Response 400:
{
  "message": "User already registered"
}
```

#### 2. Verify OTP
```http
POST /api/auth/signup/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}

Response 200:
{
  "message": "OTP verified"
}

Response 400:
{
  "message": "Invalid or expired OTP"
}

Response 429:
{
  "message": "Maximum OTP attempts exceeded"
}
```

#### 3. Set Password
```http
POST /api/auth/signup/set-password
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123"
}

Response 200:
{
  "message": "Password set successfully",
  "user": { ... }
}
```

#### 4. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123"
}

Response 200:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "6970df72f75028da9779e38b",
    "email": "user@example.com",
    "role": "user",
    "isVerified": true
  }
}

Response 401:
{
  "message": "Invalid email or password"
}
```

#### 5. Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}

Response 200:
{
  "message": "If that email exists, a reset link has been sent"
}
```

#### 6. Reset Password
```http
POST /api/auth/reset-password/:token
Content-Type: application/json

{
  "password": "NewSecurePassword123"
}

Response 200:
{
  "message": "Password has been reset"
}

Response 400:
{
  "message": "Invalid or expired reset token"
}
```

#### 7. Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}

Response 200:
{
  "message": "Logged out successfully"
}
```

### Booking Endpoints

#### 1. Create Booking
```http
POST /api/bookings
Authorization: Bearer {token}
Content-Type: application/json

{
  "pickupLocation": {
    "address": "123 Main St, City",
    "lat": 40.7128,
    "lng": -74.0060
  },
  "description": "Heart pain, need urgent care"
}

Response 201:
{
  "_id": "605e7d0f1c0e0c0c0c0c0c0c",
  "userId": "...",
  "pickupLocation": { ... },
  "status": "pending",
  "createdAt": "2024-01-25T10:00:00Z"
}

Response 401:
{
  "message": "Not authenticated"
}
```

#### 2. Get Pending Bookings (Driver)
```http
GET /api/bookings/pending
Authorization: Bearer {token}

Response 200:
{
  "bookings": [
    {
      "_id": "605e7d0f1c0e0c0c0c0c0c0c",
      "user": { "_id": "...", "name": "John Doe" },
      "pickupLocation": { ... },
      "status": "pending"
    }
  ]
}
```

#### 3. Accept Booking
```http
POST /api/bookings/:bookingId/accept
Authorization: Bearer {token}

Response 200:
{
  "message": "Booking accepted",
  "booking": { ... }
}
```

#### 4. Complete Booking
```http
POST /api/bookings/:bookingId/complete
Authorization: Bearer {token}

Response 200:
{
  "message": "Booking completed",
  "booking": { ... }
}
```

#### 5. Cancel Booking
```http
POST /api/bookings/:bookingId/cancel
Authorization: Bearer {token}

Response 200:
{
  "message": "Booking cancelled"
}
```

### User Profile Endpoints

#### 1. Get Profile
```http
GET /api/users/profile
Authorization: Bearer {token}

Response 200:
{
  "_id": "6970df72f75028da9779e38b",
  "email": "user@example.com",
  "role": "driver",
  "name": "John Doe",
  "phone": "9876543210",
  "vehicleNumber": "ABC123",
  "licenseNumber": "DL-2024-123456",
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  }
}
```

#### 2. Update Profile
```http
PUT /api/users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "9876543210",
  "vehicleNumber": "ABC123",
  "licenseNumber": "DL-2024-123456"
}

Response 200:
{
  "message": "Profile updated",
  "user": { ... }
}
```

### Error Handling

All endpoints return standard error responses:

```json
{
  "message": "Error description"
}
```

**Common HTTP Status Codes**:
- `200 OK`: Successful request
- `201 Created`: Resource created
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

---

## 8. Real-Time Features (Socket.io)

### Connection Flow

1. User logs in → Frontend receives JWT token
2. Frontend establishes Socket.io connection with auth token
3. `socket.on("connect")` → Backend validates token, identifies user
4. User joins rooms: `booking-{bookingId}`, `driver-{driverId}`, `police-{policeId}`

### Real-Time Events

#### Driver Location Updates
```javascript
// Driver emits location
emit("update-driver-location", {
  lat: 40.7128,
  lng: -74.0060,
  bookingId: "605e7d0f1c0e0c0c0c0c0c0c"
});

// Users watching booking receive update
on("driver-location-updated", {
  driverId: "...",
  lat: 40.7128,
  lng: -74.0060,
  timestamp: "2024-01-25T10:00:00Z"
});
```

#### Booking Status Updates
```javascript
// Driver accepts booking
emit("accept-booking", { bookingId: "..." });

// User & Police receive notification
on("booking-accepted", {
  bookingId: "...",
  driver: { _id: "...", name: "Driver Name", location: {...} },
  eta: "2024-01-25T10:15:00Z"
});
```

#### Police Alerts
```javascript
// Critical booking created
server emits to police room
on("critical-incident-alert", {
  bookingId: "...",
  location: { lat, lng },
  description: "Severe accident",
  policeRequired: true
});
```

### Room-Based Communication

- **Booking Room**: `booking-{bookingId}`
  - Members: User, assigned Driver, Police in jurisdiction
  - Messages: Status updates, location changes
  
- **Driver Room**: `driver-{driverId}`
  - Members: Driver, admin dashboard
  - Messages: Incoming booking offers
  
- **Police Room**: `police-{policeId}`
  - Members: Police officer, police dashboard
  - Messages: Critical incidents, location updates

### Connection Lifecycle

```
User Connects
    ↓
Socket.io handshake
    ↓
Send JWT token in auth object
    ↓
Backend validates token via authMiddleware
    ↓
User identified and joined to rooms
    ↓
Client ready to receive/emit events
    ↓
On Disconnect
    ↓
Cleanup: remove from rooms, stop location polling
```

---

## 9. Frontend Structure

### Folder Organization

```
client/
├── src/
│   ├── components/
│   │   ├── Navbar.js
│   │   ├── Footer.js
│   │   ├── ProtectedRoute.js
│   │   ├── PopupModal.js
│   │   ├── Toast.js
│   │   └── BookingStatus.js
│   ├── pages/
│   │   ├── Auth.js              # Login & Signup
│   │   ├── UserHome.js
│   │   ├── DriverDashboard.js
│   │   ├── DriverProfile.js
│   │   ├── DriverHistory.js
│   │   ├── PoliceDashboard.js
│   │   ├── PoliceProfile.js
│   │   ├── PoliceBookingDetail.js
│   │   ├── bookAmbulance.js
│   │   ├── LiveTracking.js
│   │   ├── MyBookings.js
│   │   ├── BloodHub.js
│   │   ├── help.js
│   │   ├── contactUs.js
│   │   ├── ResetPassword.js
│   │   └── HomeRouter.js
│   ├── services/
│   │   ├── bookingService.js    # Booking API calls
│   │   ├── profileService.js    # Profile API calls
│   │   └── locationService.js   # Location tracking
│   ├── hooks/
│   │   ├── useBookingSocket.js
│   │   ├── useDriverLocation.js
│   │   ├── useLocation.js
│   │   └── useProfileCompletion.js
│   ├── utils/
│   │   ├── api.js               # authFetch implementation
│   │   ├── mapIcons.js
│   │   └── ...
│   ├── styles/
│   │   ├── Auth.css
│   │   ├── Navbar.css
│   │   └── ...
│   ├── App.js
│   ├── index.js
│   └── index.css
├── public/
│   ├── index.html
│   └── manifest.json
└── .env
```

### Services Layer

**authFetch** (`utils/api.js`):
```javascript
export async function authFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
}
```

**Key Points**:
- Automatically adds JWT token to every authenticated request
- API_BASE_URL includes `/api` prefix (e.g., `https://backend/api`)
- All service calls use authFetch, not plain fetch

**Service Example** (`services/bookingService.js`):
```javascript
export const createBooking = async (bookingData) => {
  const res = await authFetch("/bookings", {
    method: "POST",
    body: JSON.stringify(bookingData),
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message);
  }
  
  return res.json();
};
```

### Environment-Based API Handling

**Frontend (.env)**:
```env
REACT_APP_API_BASE_URL=http://localhost:5000/api          # Development
# On Vercel, set to: https://render-backend-url.onrender.com/api
```

**How It Works**:
- Development: Points to local backend
- Production: Automatically uses Vercel environment variable pointing to Render backend
- No code changes needed between environments

### Custom Hooks

**useDriverLocation**:
- Establishes Socket.io connection
- Polls GPS location (driver mode)
- Emits location updates to server
- Cleanup on unmount

**useBookingSocket**:
- Listens to booking-specific Socket.io events
- Updates booking status in real-time
- Triggers notifications on status change

**useLocation**:
- Get user's current GPS coordinates
- Handle location permission prompts

---

## 10. Backend Structure

### Folder Organization

```
server/
├── controllers/
│   ├── authController.js        # Login, signup, OTP, forgot password
│   ├── bookingController.js     # Booking logic
│   ├── userController.js        # User profile
│   ├── policeController.js      # Police logic
│   └── bloodController.js       # Blood request logic
├── routes/
│   ├── auth.js
│   ├── bookingRoutes.js
│   ├── userRoutes.js
│   ├── policeRoutes.js
│   └── bloodRoutes.js
├── middleware/
│   ├── authMiddleware.js        # JWT validation
│   ├── errorMiddleware.js       # Error handling
│   └── profileMiddleware.js     # Profile validation
├── models/
│   ├── User.js
│   ├── Booking.js
│   ├── Otp.js
│   ├── PoliceLocation.js
│   └── BloodRequest.js
├── services/
│   ├── directionsService.js     # Google Maps directions
│   ├── policeAlertService.js    # Alert logic
│   └── (email moved to authController)
├── utils/
│   ├── driverAssignment.js      # Find nearest driver
│   ├── generateToken.js         # JWT generation
│   ├── geoUtils.js              # Geospatial queries
│   └── socketHandlers.js        # Socket.io event handlers
├── config/
│   └── db.js                    # MongoDB connection
├── server.js                    # Express app setup
├── .env
└── package.json
```

### Authentication Middleware

```javascript
// middleware/authMiddleware.js
const isAuthenticated = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
```

### Error Handling Strategy

1. **Try-Catch Blocks**: All async handlers wrapped in try-catch
2. **Consistent Error Responses**: All errors return JSON with `message` field
3. **Logging**: Errors logged to console with context (user ID, operation)
4. **Status Codes**: Appropriate HTTP status codes (400, 401, 403, 500)
5. **Error Middleware**: Global error handler for unhandled rejections

**Error Middleware Example**:
```javascript
const errorMiddleware = (err, req, res, next) => {
  console.error("Error:", err);
  
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  
  res.status(status).json({ message });
};

app.use(errorMiddleware);
```

### Environment Configuration

All sensitive data loaded via `dotenv`:
```javascript
require("dotenv").config();

const {
  MONGODB_URI,
  PORT,
  JWT_SECRET,
  BREVO_API_KEY,
  FROM_EMAIL,
  FRONTEND_URL,
  GOOGLE_MAPS_API_KEY
} = process.env;
```

---

## 11. Environment Variables

### Frontend Environment Variables (.env)

**Local Development**:
```env
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_GEOAPIFY_API_KEY=your_geoapify_key
```

**Production (Vercel)**:
Set in Vercel Dashboard → Settings → Environment Variables:
```
REACT_APP_API_BASE_URL=https://your-render-backend.onrender.com/api
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_GEOAPIFY_API_KEY=your_geoapify_key
```

**Why Different for Production**:
- Development: Points to localhost backend
- Production: Points to Render-hosted backend (fixed domain)

### Backend Environment Variables (.env)

**Local Development**:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret

BREVO_API_KEY=xkeysib-your_api_key
FROM_EMAIL=your_verified_sender@domain.com
FROM_NAME=Smart Ambulance

GOOGLE_MAPS_API_KEY=your_google_maps_key
FRONTEND_URL=http://localhost:3000

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_smtp_user
```

**Production (Render)**:
Set in Render Dashboard → Environment:
```
MONGODB_URI=your_mongodb_atlas_uri
PORT=5000
NODE_ENV=production
JWT_SECRET=strong_production_secret

BREVO_API_KEY=xkeysib-your_api_key (must be HTTP API key, not SMTP)
FROM_EMAIL=verified_sender@domain.com
FROM_NAME=Smart Ambulance

GOOGLE_MAPS_API_KEY=your_google_maps_key
FRONTEND_URL=https://your-vercel-frontend.vercel.app

BREVO_SMTP_HOST=smtp-relay.brevo.com (kept for reference, not used)
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_smtp_user (kept for reference, not used)
```

**Critical Differences**:
- **BREVO_API_KEY**: Must be HTTP API key (`xkeysib-`) not SMTP key (`xsmtpsib-`)
- **FROM_EMAIL**: Must be verified sender in Brevo
- **FRONTEND_URL**: Must match Vercel domain for password reset links
- **NODE_ENV**: "development" vs "production" (affects logging, error details)

---

## 12. Deployment

### Frontend Deployment (Vercel)

**Setup**:
1. Push code to GitHub
2. Connect GitHub repository to Vercel
3. Vercel auto-detects Create React App
4. Set environment variables in Vercel Dashboard
5. Deploy on every push to main branch

**Key Steps**:
- Vercel builds with `npm run build`
- Serves static files from `client/build`
- Automatic preview deployments on pull requests
- Production deployment on merge to main

**Environment Variables**:
- Set in Vercel Dashboard → Project Settings → Environment Variables
- Frontend build includes `REACT_APP_*` variables only
- Backend URL must be set to Render production URL

**Custom Domain** (Optional):
- Add domain in Vercel Dashboard
- Update DNS records as per Vercel instructions
- HTTPS automatically provisioned by Vercel

### Backend Deployment (Render)

**Setup**:
1. Create Web Service on Render
2. Connect GitHub repository
3. Set Build Command: `npm install`
4. Set Start Command: `node server.js`
5. Set environment variables
6. Deploy on every push

**Key Steps**:
- Render watches GitHub for changes
- Automatic redeploy on push to main
- Free tier has limitations (spins down after 15 min inactivity)
- Paid tier provides always-on service

**Environment Variables**:
- Set in Render Dashboard → Environment
- Verify all critical vars before deploying:
  - BREVO_API_KEY (xkeysib-)
  - FROM_EMAIL (verified)
  - MONGODB_URI (correct cluster)
  - JWT_SECRET (strong, production-grade)

**Port Configuration**:
- Render auto-assigns PORT via environment variable
- Express listens on `process.env.PORT` (default 5000 locally)
- Frontend must connect to Render-provided URL (not localhost)

### CORS Configuration

**Backend (Express)**:
```javascript
const getAllowedOrigins = () => {
  const origins = ["http://localhost:3000"];
  
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  if (process.env.VERCEL_FRONTEND_URL) {
    origins.push(process.env.VERCEL_FRONTEND_URL);
  }
  
  return origins;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (getAllowedOrigins().includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
```

**Why Dynamic CORS**:
- Local development: localhost:3000
- Production: Vercel domain (changes per deployment)
- No hardcoded domains in code
- Environment-driven configuration

### Common Deployment Issues & Fixes

#### Issue 1: 401 "Key not found" on Email Send
**Problem**: BREVO_API_KEY starts with `xsmtpsib-` (SMTP key)
**Solution**: Use HTTP API key starting with `xkeysib-`
- Go to Brevo Dashboard → SMTP & API → API Keys
- Copy the "API Key" (not SMTP credentials)
- Update BREVO_API_KEY in Render environment
- Redeploy

#### Issue 2: Email Sending Timeout
**Problem**: SMTP blocked by Render firewall
**Solution**: Brevo HTTP API doesn't use SMTP ports (already fixed)
- Confirm BREVO_API_KEY is HTTP API key
- Set timeout to 15 seconds in fetch request

#### Issue 3: 404 on `/api/...` Routes
**Problem**: Frontend API_BASE_URL missing `/api` prefix
**Solution**: Ensure REACT_APP_API_BASE_URL includes `/api`
- Example: `https://backend.onrender.com/api` (not `https://backend.onrender.com`)
- Frontend calls `authFetch("/bookings")` → `https://backend.onrender.com/api/bookings`

#### Issue 4: Forgot Password Link Broken
**Problem**: Password reset link points to wrong domain
**Solution**: Set FRONTEND_URL to Vercel production URL
- Render: Set `FRONTEND_URL=https://your-app.vercel.app`
- Backend generates reset links with this URL
- User receives correct clickable link

#### Issue 5: CORS "Origin not allowed"
**Problem**: Frontend domain not in allowed origins
**Solution**: Update FRONTEND_URL environment variable
- Render: Set `FRONTEND_URL=https://your-app.vercel.app`
- Backend dynamically adds to allowed origins
- Redeploy backend

---

## 13. Challenges Faced & Solutions

### Challenge 1: SMTP Blocked in Production

**Problem**:
- Local development used Nodemailer SMTP to Brevo SMTP server
- Production (Render) blocks port 587/465 (SMTP) connections
- Error: `ETIMEDOUT` or `ECONNREFUSED` on email send

**Solution**:
- Replaced Nodemailer SMTP with Brevo HTTP Email API
- Uses standard HTTPS (port 443), no firewall blocking
- Endpoints: `POST https://api.brevo.com/v3/smtp/email`
- HTTP API key management (`xkeysib-` prefix)

**Code Changes**:
```javascript
// Before: Nodemailer SMTP (blocked in production)
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587
});

// After: Brevo HTTP API (works everywhere)
const response = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: { "api-key": BREVO_API_KEY },
  body: JSON.stringify({ sender, to, subject, htmlContent })
});
```

**Interview Talking Points**:
- Understanding platform limitations (Render firewall)
- Choosing appropriate integration method (HTTP vs SMTP)
- Testing in production environment before full deployment
- Graceful error handling and logging for diagnostics

### Challenge 2: API Base URL Configuration

**Problem**:
- Frontend hardcoded `/api` in every fetch call
- Backend routes mounted under `/api`
- Result: `/api/api/auth/login` duplication in requests
- 404 errors in production

**Solution**:
- Moved `/api` to `REACT_APP_API_BASE_URL` environment variable
- Updated all frontend calls to use `authFetch(path)` without `/api` prefix
- Centralized URL logic in utils/api.js

**Code Changes**:
```javascript
// Before: Hardcoded /api in every call
const res = await fetch("/api/auth/login", ...);

// After: Centralized via authFetch
const res = await authFetch("/auth/login", ...);

// authFetch implementation
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL; // Includes /api
export async function authFetch(path, options) {
  return fetch(`${API_BASE_URL}${path}`, options);
}
```

**Environment Setup**:
- Local: `REACT_APP_API_BASE_URL=http://localhost:5000/api`
- Production: `REACT_APP_API_BASE_URL=https://backend.onrender.com/api`

**Interview Talking Points**:
- Importance of DRY (Don't Repeat Yourself) principle
- Environment-driven configuration for multi-environment support
- Debugging 404 errors through request inspection
- Version control best practices (not committing hardcoded URLs)

### Challenge 3: CORS Issues Between Vercel & Render

**Problem**:
- Frontend (Vercel) cannot request backend (Render) due to CORS
- Backend had hardcoded allowed origins
- Vercel domain changes on each deployment
- Error: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**:
- Implemented dynamic CORS configuration on backend
- Reads FRONTEND_URL from environment
- Whitelists both localhost (dev) and Vercel domain (production)
- No code changes needed for new Vercel deployments

**Code Changes**:
```javascript
// Before: Hardcoded origins (breaks on Vercel redeploy)
const corsOptions = {
  origin: ["http://localhost:3000", "https://old-vercel-url.vercel.app"]
};

// After: Dynamic from environment
const getAllowedOrigins = () => {
  const origins = ["http://localhost:3000"];
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
  return origins;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (getAllowedOrigins().includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  }
};
```

**Interview Talking Points**:
- Understanding CORS and same-origin policy
- Cross-domain communication in microservices
- Environment-driven configuration for deployment flexibility
- Testing CORS issues using browser DevTools

### Challenge 4: JWT Token Handling Across Environments

**Problem**:
- Token stored in localStorage, vulnerable to XSS
- No secure way to clear token on logout across devices
- Token expiry not synchronized between frontend/backend

**Solution**:
- Frontend stores token in localStorage (simple for single-page apps)
- Backend sets JWT expiry to 7 days
- Frontend handles token refresh on expiry
- Logout clears localStorage and redirects to login

**Best Practices Implemented**:
1. Token stored in localStorage with key "token"
2. Every request includes `Authorization: Bearer {token}` header
3. Backend validates token signature and expiry
4. Frontend checks token validity on app mount
5. Expired tokens trigger automatic logout

```javascript
// Frontend: Check token on mount
useEffect(() => {
  const token = localStorage.getItem("token");
  if (token) {
    try {
      const decoded = jwt_decode(token);
      if (decoded.exp * 1000 < Date.now()) {
        // Token expired
        localStorage.removeItem("token");
        navigate("/login");
      }
    } catch (e) {
      localStorage.removeItem("token");
      navigate("/login");
    }
  }
}, []);
```

**Interview Talking Points**:
- JWT anatomy (header.payload.signature)
- Token storage trade-offs (localStorage vs httpOnly cookies)
- Token validation on client and server
- Security considerations (XSS, CSRF)

### Challenge 5: Socket.io Production Connectivity

**Problem**:
- Socket.io WebSocket connections fail in production
- Vercel → Render CORS not configured for WebSocket upgrade
- Connections timeout after inactivity on free Render tier

**Solution**:
- Configured Socket.io with CORS matching Express CORS
- Set reconnection options with exponential backoff
- Implemented heartbeat to keep connections alive
- Handle graceful reconnection on network loss

**Code Changes**:
```javascript
// Backend: Socket.io with CORS
const io = new SocketIO(server, {
  cors: {
    origin: getAllowedOrigins(),
    credentials: true
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Frontend: Socket.io client
const socket = io(BACKEND_URL, {
  auth: { token: localStorage.getItem("token") },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});
```

**Interview Talking Points**:
- WebSocket protocol and fallback mechanisms
- Socket.io handshake and connection lifecycle
- Handling network connectivity issues
- Real-time features in production

---

## 14. Scalability & Future Improvements

### Current Limitations

1. **Single Backend Instance**: Render free tier has single process
2. **No Load Balancing**: Cannot distribute traffic across servers
3. **No Caching**: Every request hits MongoDB
4. **Limited Monitoring**: No centralized logging or APM
5. **No Rate Limiting**: Vulnerable to brute force attacks
6. **No Push Notifications**: Requires client to poll for updates

### Scalability Roadmap

#### Phase 1: Foundation (Next 3 months)
- Implement Redis caching for frequent queries
- Add rate limiting on OTP and login attempts
- Set up APM monitoring (e.g., Sentry, DataDog)
- Implement push notifications (Firebase Cloud Messaging)

#### Phase 2: Infrastructure (3-6 months)
- Scale to multiple backend instances (Render paid tier or AWS)
- Set up load balancer (AWS ELB, Nginx)
- Database optimization: indexing, sharding
- Implement CDN for static assets (Cloudflare)

#### Phase 3: Advanced Features (6-12 months)
- Microservices: Split into auth, booking, notification services
- Message queue (RabbitMQ, AWS SQS) for async processing
- Distributed Socket.io with Redis adapter
- Machine learning for driver assignment optimization

### Specific Improvements

#### 1. Rate Limiting OTP Requests
```javascript
// Limit OTP requests to 3 per hour per email
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => req.body.email,
  message: "Too many OTP requests. Try again later."
});

router.post("/signup/send-otp", rateLimiter, sendSignupOtp);
```

#### 2. Monitoring & Logging
```javascript
// Use Winston for structured logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/app.log" })
  ]
});

logger.info("User logged in", { userId: user._id, email: user.email });
```

#### 3. Push Notifications
```javascript
// Send push to driver for new booking
await admin.messaging().sendToDevice(driverToken, {
  notification: {
    title: "New Booking",
    body: `Pickup at ${booking.pickupLocation.address}`,
    click_action: "FLUTTER_NOTIFICATION_CLICK"
  },
  data: {
    bookingId: booking._id,
    screen: "booking"
  }
});
```

#### 4. Database Indexing
```javascript
// Add indexes for frequently queried fields
userSchema.index({ email: 1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ "pickupLocation.location": "2dsphere" }); // Geospatial
```

#### 5. Caching with Redis
```javascript
// Cache user profile for 10 minutes
const getCachedProfile = async (userId) => {
  const cached = await redis.get(`profile:${userId}`);
  if (cached) return JSON.parse(cached);
  
  const profile = await User.findById(userId);
  await redis.setex(`profile:${userId}`, 600, JSON.stringify(profile));
  return profile;
};
```

---

## 15. How to Run Locally

### Prerequisites

- Node.js 16+ and npm
- MongoDB Atlas account (free tier)
- Git
- Brevo account with API key
- Google Maps API key
- Geoapify API key

### Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/smart-ambulance.git
cd smart-ambulance
```

### Step 2: Setup Backend

```bash
cd server
npm install
```

Create `.env` file:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_dev

BREVO_API_KEY=xkeysib-your_api_key
FROM_EMAIL=your_verified_sender@domain.com
FROM_NAME=Smart Ambulance

GOOGLE_MAPS_API_KEY=your_google_maps_key
FRONTEND_URL=http://localhost:3000

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_smtp_user
```

Start backend:
```bash
npm run dev
```

Expected output:
```
Server running on port 5000
MongoDB connected
Socket.io server initialized
```

### Step 3: Setup Frontend

In a new terminal:
```bash
cd client
npm install
```

Create `.env` file:
```env
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_GEOAPIFY_API_KEY=your_geoapify_key
```

Start frontend:
```bash
npm start
```

Expected output:
```
Compiled successfully!
You can now view smart-ambulance in the browser at http://localhost:3000
```

### Step 4: Test Application

1. Open http://localhost:3000 in browser
2. Click "Sign Up"
3. Enter email and request OTP
4. Check email for OTP (or backend logs)
5. Enter OTP and set password
6. Log in
7. Complete profile
8. Test features based on role

### Step 5: Optional - Test Endpoints

```bash
# Test forgot password
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# Test booking create (replace with actual token)
curl -X POST http://localhost:5000/api/bookings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": {
      "address": "123 Main St",
      "lat": 40.7128,
      "lng": -74.0060
    },
    "description": "Medical emergency"
  }'
```

### Troubleshooting

**MongoDB Connection Failed**:
- Verify MongoDB URI is correct
- Check network access in MongoDB Atlas (whitelist your IP)
- Ensure MongoDB user has password without special chars (or properly escaped)

**BREVO_API_KEY not working**:
- Confirm key starts with `xkeysib-` (HTTP API key)
- Check if key is actually pasted (not just placeholder text)
- Verify FROM_EMAIL is a verified sender in Brevo

**Frontend can't connect to backend**:
- Verify backend is running on port 5000
- Check REACT_APP_API_BASE_URL in .env
- Ensure CORS is not blocked (check browser console)

**OTP not received**:
- Check backend logs for email send errors
- Verify FROM_EMAIL is verified in Brevo
- Check spam folder

---

## 16. Interview Questions & Talking Points

### Architecture & Design

**Q: Why did you choose this architecture (frontend/backend separated)?**

A: Separation of concerns allows:
- Independent scaling (frontend static CDN, backend API servers)
- Technology flexibility (React frontend, Express backend, could swap either)
- Better for team organization (frontend and backend teams)
- Clear API contract between systems
- Easy to test (mock API responses)

Alternative: Could use monolithic (MERN) but this gives more control and scalability.

**Q: How would you scale this to 100,000 users?**

A: 
1. **Database**: Implement Redis caching, add read replicas, shard by location
2. **Backend**: Auto-scaling groups, multiple API instances behind load balancer
3. **Frontend**: Already on CDN (Vercel), handles static assets fine
4. **Real-time**: Redis pub/sub adapter for Socket.io across multiple server instances
5. **Infrastructure**: Use Kubernetes for orchestration, multi-region for redundancy
6. **Monitoring**: Centralized logging (ELK stack), APM (DataDog), alerts

**Q: What are the security risks in your system?**

A:
1. **JWT Token**: Stored in localStorage (XSS vulnerability). Mitigation: httpOnly cookies, CSP headers
2. **Password Reset**: Token stored as hash, 15-min expiry. Good practice, but could add email verification step
3. **OTP**: 6 digits = 1M combinations, brute-forceable. Mitigation: Rate limiting (already added)
4. **API Keys**: Stored in .env (never committed). Good, but could use secrets manager (Vault)
5. **CORS**: Dynamic origin checking. Good, but could be more restrictive

### Authentication & Security

**Q: How is OTP secured in your system?**

A:
- OTP is 6 random digits (100,000 - 999,999)
- Never stored plaintext; hashed with bcryptjs (10 salt rounds)
- 5-minute expiry (stored in database)
- Max 3 incorrect attempts, then locked out
- Backend stores only hash, frontend knows plaintext during input
- Hashing cost: ~100ms per attempt (slows brute force)

**Q: Why use Brevo HTTP API instead of SMTP?**

A:
1. **Port blocking**: Serverless platforms (Render) block outgoing SMTP (587/465)
2. **HTTPS**: Uses standard HTTPS (port 443), unblocked everywhere
3. **Reliability**: Brevo handles bounces, complaints, retries
4. **Scaling**: HTTP API can handle higher throughput
5. **Integration**: Easier to implement, no connection pooling concerns
6. **Cost**: Same price as SMTP, more reliable

Tradeoff: Requires HTTP API key (different from SMTP key), but more production-ready.

**Q: How do you handle token expiry?**

A:
- Backend: JWT signed with 7-day expiry
- Frontend: Checks token validity on app mount (jwt_decode)
- If expired: Clears localStorage, redirects to login
- No refresh token mechanism (could add for true refresh)
- Logout: Clears localStorage immediately

Could improve with: Refresh tokens (separate short/long-lived tokens), token refresh endpoint.

### Real-Time Features

**Q: How do real-time updates work in Socket.io?**

A:
1. **Connection**: After login, frontend connects to Socket.io server with JWT auth
2. **Authentication**: Backend validates JWT from socket handshake, identifies user
3. **Rooms**: User joins rooms like `booking-{bookingId}`, `driver-{driverId}`
4. **Emit**: Server emits events to specific rooms (e.g., `driver-location-updated`)
5. **Listen**: Clients listening to rooms receive events in real-time
6. **Disconnect**: On logout, user leaves all rooms, connection closed

Example flow:
- Driver emits `update-driver-location` with coordinates
- Server validates and broadcasts to `booking-{bookingId}` room
- User watching booking receives update, map re-centers

**Q: What happens if Socket.io connection drops?**

A:
- Socket.io client auto-reconnects with exponential backoff
- Missed events during disconnect are lost (not queued)
- App gracefully degrades to polling (frontend polls every 5s as fallback)
- UI shows "Connecting..." during reconnect

Could improve with: Message queue (Redis) to store events for reconnected clients.

### Production & Deployment

**Q: What was the hardest problem you debugged?**

A: **SMTP blocking in production** was the most challenging:
- Worked locally (SMTP → Brevo), failed in production (Render blocks SMTP ports)
- Error was vague: "ETIMEDOUT" (network timeout)
- Took time to realize port 587 was blocked by infrastructure
- Solution: Switched to Brevo HTTP API (HTTPS, port 443)
- Learning: Understand platform limitations before deploying, use appropriate protocols

**Q: How do you handle errors in production?**

A:
1. **Backend**: Try-catch blocks log errors with context (user, operation)
2. **Frontend**: Toast notifications for user-facing errors
3. **Email failures**: Brevo returns clear errors (401, 403, etc.), logged with response body
4. **Monitoring**: Console logs (Render shows in dashboard), could add Sentry for production
5. **User communication**: Generic error messages (avoid exposing internals)

Example:
```
User sees: "Unable to send OTP right now"
Backend logs: "Email send failed: 401 Unauthorized - API key invalid"
```

**Q: How would you debug a 404 on `/api/bookings`?**

A:
1. Check frontend console (Network tab) - see full URL being requested
2. Verify REACT_APP_API_BASE_URL includes `/api`
3. Check backend routes - confirm `/api/bookings` is mounted
4. Test endpoint directly with curl to backend
5. Check CORS headers (browser blocked? or backend rejected?)
6. Review authMiddleware - token validation succeeding?

In this project, we fixed it by moving `/api` to environment variable, so all calls properly include it.

### Full-Stack Thinking

**Q: Walk through a complete user booking flow.**

A:
1. **Frontend**: User clicks "Book Ambulance", enters location
2. **Request**: `authFetch("/bookings", POST)` with pickup location
3. **Backend**: Receives at `POST /api/bookings`
   - authMiddleware validates JWT
   - bookingController creates Booking document with `status: "pending"`
   - Saves to MongoDB
4. **Emit**: Server broadcasts `new-booking` to `police-{jurisdiction}` room
5. **Frontend**: 
   - Shows booking details page
   - Joins Socket.io room `booking-{bookingId}`
   - Listens for `booking-accepted`, `booking-completed` events
6. **Driver Side**:
   - Sees pending booking in DriverDashboard
   - Clicks Accept
   - `POST /api/bookings/:bookingId/accept` with driver location
7. **Backend**: Updates booking `status: "accepted"`, links driver
8. **Emit**: Server sends `booking-accepted` to booking room
9. **Frontend**: Shows driver details, starts requesting location updates
10. **Real-Time**: Driver location emitted every 5s, user sees live map
11. **Complete**: Driver marks complete, triggers email/notification to user

This flow involves: authentication, database, real-time communication, multi-role logic.

**Q: How would you add push notifications?**

A:
1. Frontend: Request notification permission on login
2. Store device token in User collection (fcm_token)
3. Backend: When booking status changes, send via Firebase:
   ```
   admin.messaging().sendToDevice(driverToken, { title, body, data })
   ```
4. Client: Listen to messages, show notification + deep link
5. Analytics: Track which users have enabled notifications

This would reduce reliance on Socket.io for background updates.

---

## Conclusion

Smart Ambulance demonstrates full-stack development with real-world complexities:
- **Frontend**: React with real-time communication
- **Backend**: Express with scalable API design
- **Database**: MongoDB for flexible data
- **Authentication**: Secure JWT-based system
- **Email**: Production-grade transactional system
- **Real-Time**: Socket.io for live updates
- **Deployment**: Multi-platform (Vercel, Render, MongoDB Atlas)

The project prioritizes **reliability, security, and scalability** while maintaining **clean code architecture** and **best practices** across the stack.

---

## References

- [Brevo Email API Documentation](https://developers.brevo.com/docs)
- [Socket.io Docs](https://socket.io/docs)
- [JWT Introduction](https://jwt.io/introduction)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- [Render Deployment](https://render.com/docs)
- [Vercel Deployment](https://vercel.com/docs)

---
