# Smart Campus Monitoring — Mobile Edition

React Native & Expo cross-platform mobile client for the Smart Campus Monitoring System, providing authenticated campus telemetry, live crowd occupancy, parking structure availability, edge CCTV camera health, incident lifecycle management, and push notification foundation.

---

## Architecture Overview

- **Framework**: React Native 0.88.0 + Expo SDK 58.0.0
- **Routing**: Expo Router 58.0.25 (File-based navigation with route guards)
- **State & Realtime**: React Context (`AuthContext`, `SocketContext`) + Socket.IO Client 4.8.4
- **Security & Storage**: `expo-secure-store` (Hardware-backed keychain/keystore on native with safe in-memory fallback for test runners)
- **Push Notifications**: `expo-notifications` (Foreground presentation, tap-to-navigate routing, and deduplication engine)
- **Design System**: Vanilla React Native styles with curated HSL-tailored palette, adaptive light/dark theming, Lucide icons, and WCAG-compliant touch targets (min 44px).

---

## Getting Started

### 1. Prerequisites
- Node.js >= 18.0.0 (Node 20+ recommended)
- npm or yarn
- Expo Go app on iOS/Android device OR an Android Emulator (Android Studio) / iOS Simulator (Xcode on macOS)

### 2. Dependency Installation
Navigate to the `mobile` workspace and install dependencies:

```bash
cd mobile
npm install
```

### 3. Environment & Networking Configuration
Copy the template configuration file:

```bash
cp .env.example .env
```

Edit `.env` to match your development target:

| Target Runtime | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_SOCKET_URL` |
| :--- | :--- | :--- |
| **Android Emulator** | `http://10.0.2.2:5000/api/v1` | `http://10.0.2.2:5000` |
| **iOS Simulator / Web** | `http://localhost:5000/api/v1` | `http://localhost:5000` |
| **Physical Device (Expo Go)** | `http://<YOUR_LAN_IP>:5000/api/v1` | `http://<YOUR_LAN_IP>:5000` |

> **Note**: `mobile/constants/config.js` automatically derives your local network IP from `Constants.expoConfig?.hostUri` when running via Expo Go. Setting `.env` provides an explicit override.

### 4. Running the Development Server

Start Metro bundler:

```bash
npm start
```

Press:
- `a` to open Android emulator
- `i` to open iOS simulator
- `w` to open web preview
- Scan QR code with Expo Go (Android) or Camera (iOS) for physical devices

---

## Automated Testing

Run the mobile test suite (58 unit and integration tests):

```bash
npm test
```

Tests cover:
- Role Boundaries & RBAC Permissions (`SUPER_ADMIN`, `DEPT_HEAD`, `FACULTY`, `STUDENT`)
- Secure Token Storage & Session Expiration Lifecycle
- Unified API Client Error Parsing & 401 Interceptors
- Incident State Machine Valid Transitions & Terminal State Guards
- Parking & Occupancy Math with Division-by-Zero Protection
- Socket.IO Managed Singleton Client & Token Change Resets
- Realtime Event Payload Validation across 6 Canonical Events
- Notification In-Memory Deduplication & Cache Clearance on Logout
- Notification Tap Deep-Link Route Resolution
- Android & iOS App Release Configuration Audit

---

## Role-Based Access Control Matrix

| Feature Screen | Route Path | SUPER_ADMIN | DEPT_HEAD | FACULTY | STUDENT |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Overview Dashboard** | `/(app)` | ✅ Full | ✅ Dept | ✅ Read | ✅ Student |
| **Parking Availability** | `/(app)/parking` | ✅ Full | ✅ Full | ✅ Full | ✅ Public |
| **Crowd Occupancy** | `/(app)/occupancy` | ✅ Full | ✅ Full | ✅ Full | ✅ Public |
| **Incident Management** | `/(app)/incidents` | ✅ Read/Write | ✅ Read/Write | ✅ Read/Write | ❌ Blocked |
| **Incident Detail** | `/(app)/incidents/[id]` | ✅ Read/Write | ✅ Read/Write | ✅ Read/Write | ❌ Blocked |
| **CCTV Feeds** | `/(app)/cameras` | ✅ Full | ✅ Dept | ✅ Read | ❌ Blocked |

*Unauthenticated users are automatically guarded and redirected to `/(auth)/login`.*

---

## Push Notifications & Realtime

### 1. In-App Realtime Updates
The mobile client establishes an authenticated Socket.IO connection upon successful user login. It subscribes to canonical events emitted by the backend:
- `parking:updated`: In-place parking space counter adjustments.
- `occupancy:updated`: Crowd density level and capacity adjustments.
- `camera:status`: Camera online/offline toggles (staff only).
- `incident:created`: Auto-prepends newly dispatched anomalies (staff only).
- `incident:updated`: In-place status transitions (guards against out-of-order timestamps).
- `notification:created`: Increments unread badge and prepends to notification center.

### 2. Disconnection & Resynchronization
- Disconnection triggers an amber `Offline (stale)` indicator in screen headers.
- When network connectivity is restored, the client automatically triggers an authoritative REST refresh without UI flickering.

### 3. Push Notification Prerequisites
- **Foreground Alerts**: Fully configured with `Notifications.setNotificationHandler`.
- **Notification Tap Navigation**: Integrated with `resolveNotificationRoute` to navigate to corresponding resources (e.g. `/(app)/incidents/[id]`).
- **Physical Device**: Device push token generation requires a physical device or standalone build.
- **Backend Push Dependency**: The backend currently supports Firebase Admin dispatch in `push.service.js` but does **not** yet expose an endpoint for client device-token registration (e.g. `POST /api/v1/notifications/device-token`). The mobile architecture is prepared to transmit tokens once the backend endpoint is added.

---

## Release & Build Preparation

### App Identifiers
- **Android Package**: `com.campus.smartmonitoring`
- **iOS Bundle Identifier**: `com.campus.smartmonitoring`
- **Version**: `1.0.0`

### 1. Testing Production Bundles Locally
Verify production Metro bundling for both platforms:

```bash
# Android Bundle Verification
npx expo export -p android --no-bytecode

# iOS Bundle Verification
npx expo export -p ios --no-bytecode
```

### 2. Creating Standalone Builds via EAS (Expo Application Services)

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Authenticate with your Expo account:
   ```bash
   eas login
   ```

3. Configure project credentials:
   ```bash
   eas project:init
   ```

4. **Android Preview APK** (for internal testing without Google Play):
   ```bash
   eas build --platform android --profile preview
   ```

5. **Android Production AAB** (for Google Play Console):
   ```bash
   eas build --platform android --profile production
   ```
   *Prerequisites*: Google Play Developer account, Keystore (automatically generated or provided via EAS).

6. **iOS Production Archive** (for Apple App Store / TestFlight):
   ```bash
   eas build --platform ios --profile production
   ```
   *Prerequisites*: Paid Apple Developer Program membership ($99/yr), App Store Connect provisioning profile and distribution certificates.

---

## Known Feature Limitations

1. **Background Socket Sleep**: Operating systems (iOS and Android) suspend active WebSocket connections when the app transitions to the background. Updates during suspension rely on push notifications and resynchronize immediately upon foreground resumption.
2. **Backend Device-Token Route**: The backend lacks a dedicated `POST /notifications/device-token` API route; device tokens remain cached on the client until backend storage is deployed.
3. **No Direct RTSP Hardware Decoding**: Video stream playback on mobile connects to optimized HLS/WebRTC feeds rather than raw edge camera RTSP streams to conserve mobile battery and bandwidth.
