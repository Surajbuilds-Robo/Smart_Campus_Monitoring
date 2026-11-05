# Smart Campus Monitoring — Shared API & Realtime Contracts

This document defines the canonical interface contracts, payload schemas, and realtime communication protocols across the **Backend API**, **React Frontend**, and **Python AI Edge Service**.

---

## 1. Global Conventions

- **API Base Prefix**: `/api/v1`
- **Default Port**: `5000`
- **Payload Format**: Standard JSON (`application/json; charset=utf-8`)
- **Authentication**: Bearer JWT in the `Authorization` header (`Authorization: Bearer <token>`)
- **Edge AI Authentication**: Bearer token in the `Authorization` header (`Authorization: Bearer <AI_SERVICE_TOKEN>`)
- **Response Format**:
  ```json
  {
    "success": true,
    "message": "Human readable status summary",
    "data": { ... }
  }
  ```
- **Error Format**:
  ```json
  {
    "success": false,
    "message": "Error description",
    "errors": [ ... ]
  }
  ```

---

## 2. Role Permissions & Authorization Matrix

| Feature Module | Endpoint | Super Admin | Dept Head | Faculty | Student |
|---|---|:---:|:---:|:---:|:---:|
| **Health Check** | `GET /api/v1/health` | Public | Public | Public | Public |
| **Auth Login** | `POST /api/v1/auth/login` | Public | Public | Public | Public |
| **Auth Register** | `POST /api/v1/auth/register` | Public (STUDENT role created) | Public | Public | Public |
| **Current User** | `GET /api/v1/auth/me` | Authenticated | Authenticated | Authenticated | Authenticated |
| **Cameras (List)** | `GET /api/v1/cameras` | Global | Department | Department | Forbidden (403) |
| **Cameras (Manage)**| `POST, PATCH /api/v1/cameras` | Global | Department | Forbidden (403) | Forbidden (403) |
| **Parking (View)** | `GET /api/v1/parking` | Global | Global | Global | Global |
| **Parking (Manage)**| `POST, PATCH /api/v1/parking` | Global | Department | Forbidden (403) | Forbidden (403) |
| **Occupancy (View)**| `GET /api/v1/occupancy` | Global | Global | Global | Public Zones |
| **Occupancy (Post)**| `POST /api/v1/occupancy` | Global | Department | Department | Forbidden (403) |
| **Incidents (View)**| `GET /api/v1/incidents` | Global | Department | Department | Forbidden (403) |
| **Incidents (State)**| `PATCH /api/v1/incidents/:id/status` | Global | Department | Department | Forbidden (403) |
| **Incidents (Assign)**| `PATCH /api/v1/incidents/:id/assign` | Global | Department | Forbidden (403) | Forbidden (403) |
| **Notifications** | `GET, PATCH /api/v1/notifications` | Private user inbox | Private | Private | Private |
| **Users (Manage)** | `GET, POST, PATCH /api/v1/users` | Global | Department | Forbidden (403) | Forbidden (403) |
| **AI Ingestion** | `POST /api/v1/ai/events` | AI Token | AI Token | AI Token | AI Token |

---

## 3. Incident State Machine

```
        +----------------------------------------+
        |                                        |
        v                                        v
     [ new ] ---> [ acknowledged ] ---> [ investigating ]
        |                |                       |
        |                +----------+            |
        |                           |            |
        v                           v            v
  [ dismissed ]                [ resolved ] <----+
```

### Permitted Transitions
- **`new`** &rarr; `acknowledged`, `dismissed`
- **`acknowledged`** &rarr; `investigating`, `resolved`, `dismissed`
- **`investigating`** &rarr; `resolved`, `dismissed`
- **`resolved`** &rarr; *Terminal (no further transitions allowed, returns 409)*
- **`dismissed`** &rarr; *Terminal (no further transitions allowed, returns 409)*

---

## 4. Realtime Socket.IO Protocol

### Handshake & Authentication
Clients connect using `transports: ["websocket", "polling"]` and supply JWT token in the handshake:
```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:5000", {
  auth: { token: "<JWT_ACCESS_TOKEN>" }
});
```

### Authorized Room Structure
Upon connection, `joinAuthorizedRooms` automatically enrolls the socket into permitted rooms:
- **`user:<userId>`**: Direct user notifications.
- **`role:<role>`**: Broadcasts scoped to role (`SUPER_ADMIN`, `DEPT_HEAD`, `FACULTY`, `STUDENT`).
- **`department:<deptId>`**: Department-level incidents, cameras, and occupancy updates.
- **`system:global`**: Global critical alerts (accessible to `SUPER_ADMIN`).

### Event Names & Payloads
- **`connection:ready`**: Sent by server upon successful handshake.
- **`camera:status`**: Emitted when camera connectivity changes (`online`, `offline`, `maintenance`).
- **`incident:created`**: Emitted to `role:SUPER_ADMIN` and `department:<deptId>` when an incident is created.
- **`incident:updated`**: Emitted on status transition or staff assignment.
- **`parking:updated`**: Broadcast to all connected campus users upon space occupancy change.
- **`occupancy:updated`**: Emitted on crowd density change; sanitized public availability sent to students.
- **`notification:created`**: Delivered strictly to `user:<userId>`.

---

## 5. AI Ingestion Contract (`POST /api/v1/ai/events`)

### Request Headers
- `Authorization: Bearer <AI_SERVICE_TOKEN>`
- `Content-Type: application/json`

### Request Payload
```json
{
  "camera_id": "CAM-001",
  "event_type": "crowd_overcrowding",
  "severity": "warning",
  "confidence": 0.94,
  "message": "Sustained crowd surge detected at North Campus Main Entrance.",
  "metadata": {
    "occupancy_ratio": 0.88,
    "people_count": 88,
    "capacity": 100
  }
}
```

### Deduplication Rule
The backend checks for existing active incidents (`new`, `acknowledged`, `investigating`) on the same camera and event type within a **5-minute sliding window**. If an active incident exists, it updates confidence and metadata, returning `{ "deduplicated": true }` with HTTP `200 OK` rather than generating duplicate alerts.
