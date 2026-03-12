# Pranapath AI Knowledge Base

**Last Updated:** February 7, 2026  
**Purpose:** Authoritative reference for Pranapath AI Assistant

---

## GENERAL

**Pranapath** is an emergency medical services coordination platform connecting:
- **Users** requesting ambulance services
- **Drivers** operating ambulances
- **Police** monitoring emergency routes

**Core Function**: Real-time ambulance dispatch, live tracking, and blood donation coordination.

**Technology Stack**:
- Frontend: React 19.1.1
- Backend: Node.js + Express
- Database: MongoDB Atlas
- Real-time: Socket.io
- Auth: JWT tokens (7-day expiry)
- Maps: Google Maps API
- Email: Brevo API

---

## USER_ROLES

### User (Default Role)
**Capabilities**:
- Book ambulances for emergency transport
- Track ambulance location in real-time
- Request blood donations
- Respond to blood donation requests
- View booking history
- Update profile

**Required Profile Fields** (enforced before booking/blood request):
- Name, Mobile (10 digits), DOB, Blood Group, Area, Pincode (6 digits)

### Driver
**Capabilities**:
- Toggle on-duty / off-duty status
- View pending bookings within 15km radius
- Accept ambulance bookings
- Complete bookings after delivery
- Share real-time location while on-duty
- View booking history

**Special Requirements**:
- Must be on-duty to see pending bookings
- Must have valid location updates (or auto-marked off-duty after 60 seconds)
- Mobile number REQUIRED to go on-duty

**Auto Off-Duty**: If location not updated for 60 seconds, system marks driver off-duty automatically

### Police
**Capabilities**:
- View ambulance bookings alerted to their location
- Monitor live ambulance routes (real-time tracking)
- Track driver location for active bookings
- Read-only access to booking details

**Alert Trigger**: Only "accepted" bookings where ambulance route passes within 150 meters of saved police location

**Limitations**: Cannot accept, cancel, or modify bookings

### Role Assignment
- Set during signup (last step of 3-step OTP process)
- Valid roles: "user", "driver", "police"
- **Cannot be changed** after account creation

---

## APP_FLOW

**1. Signup (3 Steps)**:
- Enter email → Receive OTP (5-min expiry, 3 attempts max)
- Verify OTP code
- Set password (8+ chars) → Select role (user/driver/police)

**2. Complete Profile**:
- Fill required fields: Name, Mobile (10 digits), DOB, Blood Group, Area, Pincode (6 digits)
- Required before booking ambulances or requesting blood

**3. User Books Ambulance**:
- Enter pickup location & destination
- System searches for available drivers (90 seconds)
- Drivers within 15km of pickup location can see booking

**4. Driver Accepts Booking**:
- Booking status changes to "accepted"
- User receives instant notification with driver details (name, mobile, vehicle number)
- Google Directions API calculates route
- Police notified if route passes within 150m of their location

**5. Live Tracking Phase**:
- Driver shares location continuously (real-time updates)
- User tracks ambulance on map
- Police monitor route (if alerted)
- Both parties can share precise locations

**6. Booking Completion**:
- Driver marks booking "completed"
- User receives completion notification
- Booking added to history
- Police dashboard updated (booking disappears)

**7. Blood Donation (Parallel Flow)**:
- User requests blood → System finds matching donors
- Donors notified in real-time → Accept request → Coordinate over phone
- Either party marks complete after donation

---

## BOOKING_AMBULANCE

### How to Book
1. **Complete profile** (all required fields)
2. Click **"Book Ambulance"** button
3. Enter **pickup location** (map/manual entry)
4. Enter **destination** (typically hospital)
5. Click **"Book Now"**

### Search Details
- **Duration**: 90 seconds (fixed search window)
- **Driver eligibility**: On-duty drivers within 15km of pickup
- **Stale booking**: After 90 seconds, booking becomes inactive
- **Re-search needed**: Create new booking for fresh 90-second search
- **Duplicate prevention**: Cannot create booking if one already pending

### What Happens After Booking

**Seconds 0-90 (Search Window)**:
- Booking status = "pending"
- Visible to on-duty drivers within 15km
- Drivers can see your booking details and user info

**Driver Accepts**:
- Booking status → "accepted"
- Driver assigned to booking
- You receive notification: driver name, mobile, vehicle number
- Route calculated and police alerted if applicable

**During Transport**:
- Real-time tracking enabled
- Both driver & user can share live locations
- Police monitor if alerted

**After Completion**:
- Driver marks "completed"
- Booking added to both parties' history
- Tracking page shows "Completed"

### Live Tracking Overview
- **Map shows**: Pickup location, destination, driver's current location
- **Updates**: Every few seconds (driver broadcasts location)
- **Display**: Estimated arrival time, route visualization
- **User controls**: Can share precise location to help driver find you
- **Duration**: Continues until driver completes booking

### Cancellation Rules

**Before Driver Accepts**:
- User cancels → status "cancelled" (final)
- Booking disappears from driver list
- New 90-second search must be started

**After Driver Accepts**:
- User cancels → status "cancelled", driver notified
- Driver cancels → status "pending", new driver can accept
- Cannot cancel if already "completed"

---

## AMBULANCE_TYPES

**NOT explicitly implemented** in current version.

Based on code analysis:
- Only **one ambulance type** exists: Emergency Ambulance
- No user selection for ambulance type
- No ICU vs. standard distinction
- No specialty ambulance routing

**Note**: Database schema includes ambulance_type field but feature is not integrated into booking flow.

---

## POLICE_ALERT

### When Police Are Alerted

**Trigger Event**: Driver accepts ambulance booking

**Conditions**:
- Ambulance route passes within **150 meters** of police saved location
- Booking status must be "accepted" (not pending, not completed)
- Police must have location saved in profile

### How Alerts Are Triggered

1. **Driver accepts booking** → System initiates route calculation
2. **Google Maps Route**: Fetches turn-by-turn directions (pickup to destination)
3. **Route Decoding**: Converts compressed polyline into GPS coordinate points
4. **Police Location Check**: For each police officer with saved location:
   - Calculates **shortest distance** from police point to any segment of route
   - Uses precise point-to-segment distance (not just start/end points)
   - **Alert threshold: 150 meters**
5. **If distance ≤ 150m**: Police added to booking's alertedPolice array
6. **Socket.io Notification**: Real-time alert sent to police: "🚑 Ambulance route passes near your location"

### What Information Is Shared with Police

**Notifications Include**:
- Booking ID
- Distance from police location (in meters)
- Alert message

**Police Dashboard Shows**:
- User information (name, mobile)
- Driver information (name, mobile, vehicle)
- Pickup location & destination
- Real-time driver location (updates continuously)
- Route on map

**Police Cannot**:
- Accept bookings
- Cancel bookings
- Contact user/driver through app (must call directly)
- Modify any booking details

### Alerts NOT Sent If:
- Google Directions API fails (no route found)
- Police have no saved location in profile
- Route passes outside 150m radius from police location
- Booking is cancelled or completed

---

## BLOOD_REQUEST

### How Users Request Blood

**Steps**:
1. Navigate to **Blood Hub**
2. Ensure profile is complete (blood group required)
3. Click **"Request Blood"**
4. Enter:
   - **Blood Group** (select: A+, A-, B+, B-, AB+, AB-, O+, O-)
   - **Hospital** (name/location where blood needed)
   - **Urgency** (low/medium/high/critical)
5. Submit request

**Validation**:
- All three fields required
- Only one pending request allowed (error if already pending)

### How Donors Are Notified

**Automatic Matching**:
- System queries all users with **exact matching blood group**
- Excludes requester (cannot donate to self)
- Only includes role="user" (drivers/police excluded)

**Notification Sent To**:
- All eligible donors receive real-time socket notification
- Notification includes:
  - Blood group needed
  - Hospital location
  - Urgency level
  - Requester name & mobile number

**Donor Actions**:
- Can accept or ignore notification
- If accept: Donor name & mobile sent to requester
- Parties coordinate directly over phone

**Completion**:
- Either requester or donor marks complete
- Request status changes to "completed"
- Can create new request after completion

### Blood Group Matching

**Important Limitation**:
- Uses **exact blood group match only**
- Does NOT recognize universal donors (O- can give to anyone)
- Does NOT use blood compatibility table
- Example: O- donor won't see O+ requests

**Why**: Simplifies logic, avoids medical decision-making by app

### Role Restrictions

**Who CAN request/donate blood**:
✅ Users only

**Who CANNOT**:
❌ Drivers (excluded from donor queries)
❌ Police (excluded from donor queries)
❌ No cross-role blood donation

---

## SAFETY_AND_LIMITS

### What Pranapath Does NOT Do

**❌ NO Medical Advice**
- Cannot diagnose conditions
- Cannot recommend medications or treatments
- Cannot advise on severity of symptoms
- Cannot provide emergency protocols

**❌ NO Direct Emergency Calls**
- Does NOT call 911/108/ambulance automatically
- Users MUST call emergency services independently
- Pranapath is coordination tool, not emergency dispatcher

**❌ NO Medical Decision-Making**
- Cannot suggest blood type compatibility (uses exact match only)
- Cannot recommend ambulance type based on condition
- Cannot verify patient transport eligibility

**❌ NO Automatic Failover**
- If driver cancels, user must wait for new driver
- If no driver accepts in 90 seconds, user must create new booking
- No backup driver auto-assigned

**❌ NO Scheduled Booking**
- Cannot book future transport
- Only real-time emergency bookings

**❌ NO Rating System**
- Cannot rate drivers after booking
- No feedback loop for quality assessment

### Critical Disclaimers

**In Life-Threatening Emergency**:
- **CALL EMERGENCY SERVICES FIRST** (911, 108, local number)
- Pranapath is supplementary, NOT replacement
- Do NOT wait for app confirmation
- Seconds matter in emergencies

**System Limitations**:
- **90-second search window** may not find driver quickly
- **15km radius** limited in remote areas
- **Driver availability** may be zero (no guarantee)
- **No guaranteed response time** in current implementation

**Data & Privacy**:
- Mobile numbers visible to drivers (for contact)
- Police locations saved for route alerts
- JWT tokens valid 7 days (cannot revoke before expiration)
- All data in transit encrypted

**Network Dependent**:
- Requires continuous internet connection
- No offline functionality
- Service depends on Google Maps API availability
- Brevo email service must be operational for OTP

### Not Emergencies for Pranapath

❌ Allergic reactions  
❌ Chest pain  
❌ Severe bleeding  
❌ Difficulty breathing  
❌ Poisoning/overdose  
❌ Loss of consciousness  

**For these**: Call emergency services immediately, then use Pranapath if needed.

---

## TECHNICAL CONSTRAINTS

### Search & Matching
- **Booking search**: 90 seconds (hardcoded)
- **Driver radius**: 15km (hardcoded)
- **Police alert radius**: 150 meters (hardcoded)
- **Blood match**: Exact blood group only (no compatibility logic)

### Timeouts & Expiration
- **OTP**: 5 minutes
- **OTP attempts**: 3 max (then blocked)
- **JWT token**: 7 days
- **Password reset link**: 15 minutes
- **Driver off-duty**: 60 seconds without location update

### Profile Validation
- **Mobile number**: Exactly 10 digits
- **Pincode**: Exactly 6 digits
- **Password**: Minimum 8 characters
- **Name**: Text (no length limit specified)

### No Current Implementation
- Rate/review system for drivers
- Scheduled/future bookings
- Multiple ambulance types selection
- ICU/special ambulance routing
- SMS notifications (email only)
- Automatic emergency service dispatch
- Hospital confirmation workflow

---

## QUICK REFERENCE

| Feature | User | Driver | Police |
|---------|------|--------|--------|
| Book ambulance | ✅ | ❌ | ❌ |
| Accept booking | ❌ | ✅ | ❌ |
| Track ambulance | ✅ | ❌ (own) | ✅ (alerted) |
| Toggle on-duty | ❌ | ✅ | ❌ |
| Request blood | ✅ | ❌ | ❌ |
| Donate blood | ✅ | ❌ | ❌ |
| View history | ✅ | ✅ | ❌ |
| Monitor emergencies | ❌ | ❌ | ✅ |
| Update profile | ✅ | ✅ | ✅ |

---

**All information derived from Pranapath codebase as of February 7, 2026.** If a feature is not documented here, it does not exist in the current implementation.
