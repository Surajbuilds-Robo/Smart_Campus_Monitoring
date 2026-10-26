# Smart Campus Monitoring — Frontend Web Application

The frontend is a modern, responsive, role-aware single-page application built with **React**, **Vite**, **Tailwind CSS**, and **Socket.IO Client**. It provides operational visibility into campus surveillance, parking strucACtures, crowd occupancy, safety incidents, and administrative workflows.

---

## 1. Feature Screens & Capabilities

1. **Operations Dashboard (`/dashboard`)**: Role-customized command center displaying real-time KPI counters, security alert tickers, active incident queues, parking meters, and crowd hotspots.
2. **Camera Monitoring (`/cameras`)**: Surveillance camera directory with connectivity status badges (`online`, `offline`, `maintenance`), search/filter, and edge telemetry diagnostics.
3. **Parking Availability (`/parking`)**: Live space availability, total capacity, occupied percentages, and lot status indicators (`available`, `full`, `unavailable`).
4. **Crowd Density (`/crowd`)**: Zone headcounts, capacity utilization progress bars, and threshold classifications (`normal` < 70%, `warning` 70–89%, `critical` &ge; 90%).
5. **Incident Management (`/incidents`)**: Security incident triage list, severity pills, incident detail drawer, authorized lifecycle transitions, and role-restricted evidence access.
6. **Notifications (`/notifications`)**: User-specific notification inbox with unread filters, inline read toggles, and mark-all-read.
7. **User Administration (`/users`)**: Account provisioning, role assignment, active/disabled toggling, and department filtering.
8. **Campus Resources (`/resources`)**: Emergency, medical, IT, and safety hotline directory with quick-dial actions.
9. **Settings & Diagnostics (`/settings`)**: Current session details, edge AI detection rule overview, and WebSocket connection diagnostics.

---

## 2. Environment Configuration

Copy the example configuration:
```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api/v1` | Base URL of the backend REST API |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Realtime Socket.IO server address |

---

## 3. Scripts & Commands

### Development Server
```bash
npm run dev
```
Starts the Vite development server with HMR at `http://localhost:5173`.

### Production Build
```bash
npm run build
```
Type checks and bundles the application to `dist/`.

### ESLint Check
```bash
npm run lint
```
Lints all source files and test suites with zero errors.

### Automated Tests
```bash
npm test
```
Executes all 34 frontend unit and contract tests verifying API clients, role routing, navigation contracts, realtime deduplication, and component exports.
