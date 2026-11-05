# Smart Campus Monitoring — Backend Service

The backend is an enterprise-grade REST API and realtime Socket.IO gateway built on **Node.js**, **Express**, and **MongoDB / Mongoose**. It enforces role-based access control across campus administrative tiers, provides real-time event distribution, and ingests structured detection metadata from edge AI computers.

---

## 1. Features & Architecture

- **Modular Domain Architecture**: Feature modules isolated under `backend/modules/` (`auth`, `users`, `cameras`, `parking`, `occupancy`, `incidents`, `notifications`, `ai`, `audit`).
- **Four-Tier Role Permissions**: Strict authorization enforced server-side for `SUPER_ADMIN`, `DEPT_HEAD`, `FACULTY`, and `STUDENT`.
- **Department Boundary Enforcement**: Scopes surveillance cameras, incidents, and administrative workflows by department with campus-wide fallback.
- **Incident State Machine**: Enforces valid status transitions (`new` &rarr; `acknowledged` &rarr; `investigating` &rarr; `resolved` / `dismissed`) and rejects unauthorized state changes with `409 Conflict`.
- **Surveillance Privacy Protection**: Automatically strips private incident evidence from all student responses, while enforcing a 30-day retention window on active media.
- **AI Event Ingestion**: Validates camera registrations and automatically deduplicates rapid detections within a 5-minute sliding window.
- **Realtime Gateway**: Socket.IO server with handshake JWT verification and strict room isolation (`user:<id>`, `role:<role>`, `department:<deptId>`, `system:global`).
- **Resilient Database Layer**: Automatic fallback to an embedded in-memory MongoDB in local development when no external MongoDB daemon is listening on port 27017.

---

## 2. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP and WebSocket server port |
| `HOST` | `0.0.0.0` | Network binding host address |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/smart_campus` | MongoDB connection URI |
| `JWT_SECRET` | *(required)* | Secret string of at least 32 characters for signing JWTs |
| `JWT_EXPIRES_IN` | `1h` | Token expiration duration |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5174` | Comma-separated list of allowed web origins |
| `AI_SERVICE_TOKEN` | *(required)* | Shared secret token for edge AI event ingestion |

---

## 3. Demo Accounts & Seed Data

When started in development with an empty database, the server automatically provisions demo campus accounts and resources:

| Role | Email | Password | Scope |
|---|---|---|---|
| **Super Admin** | `admin@campus.edu` | `Admin@123456` | Global campus operations |
| **Dept Head** | `depthead@campus.edu` | `DeptHead@123456` | Engineering Department (`65f1a2b3c4d5e6f7a8b9c0d1`) |
| **Faculty** | `faculty@campus.edu` | `Faculty@123456` | Engineering Department (`65f1a2b3c4d5e6f7a8b9c0d1`) |
| **Student** | `student@campus.edu` | `Student@123456` | Public student-facing facilities |

---

## 4. Running the Backend

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Production Start
```bash
npm start
```

### Health Check
```bash
curl http://localhost:5000/api/v1/health
```

---

## 5. Automated Tests

Run the complete backend test suite using Node.js native test runner:
```bash
npm test
```
All 92 unit, integration, security, and realtime tests will execute in isolated test environments.
