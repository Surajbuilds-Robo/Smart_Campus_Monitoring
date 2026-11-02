# Smart Campus Monitoring — AI Edge Service

The AI Edge Service is a Python-based edge component that processes authorized camera streams (RTSP, test video files, or webcams), performs object detection and crowd estimation using YOLOv8, enforces a 2-minute persistence rule to suppress transient false positives, captures evidence snapshot bursts upon confirmed incidents, and securely submits structured events to the Node.js backend via authenticated REST endpoints.

---

## 1. Prerequisites and Python Version

- **Python Version**: Python 3.10+ (tested on Python 3.10 / 3.11 / 3.12)
- **Virtual Environment**:
  ```bash
  python -m venv .venv
  # On Windows:
  .venv\Scripts\activate
  # On Linux / macOS:
  source .venv/bin/activate
  ```
- **Dependencies Installation**:
  ```bash
  pip install -r requirements.txt
  ```
  Core dependencies:
  - `ultralytics` (YOLOv8 inference)
  - `opencv-python` (video capture, frame processing, snapshot burst encoding)
  - `requests` (authenticated HTTP transport with bounded backoff retries)
  - `python-dotenv` (environment configuration management)

---

## 2. Environment Configuration

Copy the example environment configuration:
```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CAMERA_SOURCE` | `test_video.mp4` | Video path (`.mp4`), RTSP URL (`rtsp://...`), or webcam index (`0`) |
| `CAMERA_ID` | `camera-01` | Matching backend camera identifier string |
| `BACKEND_URL` | `http://localhost:5000` | Base URL of the Express backend |
| `AI_SERVICE_TOKEN` | *(required)* | Bearer token matching backend's `AI_SERVICE_TOKEN` |
| `PERSON_MODEL_PATH` | `yolov8n.pt` | Path or name of YOLOv8 object detection weights |
| `EVENT_MODEL_PATH` | *None* (optional) | Path to fine-tuned weights for fall / violence classification |
| `CONFIDENCE_THRESHOLD` | `0.35` | Minimum detection confidence score (0.0 to 1.0) |
| `CROWD_CAPACITY` | `100` | Normal area threshold for calculating crowd percentage |
| `PERSISTENCE_SECONDS` | `120` | Duration (seconds) an anomaly must persist before alert |
| `FRAME_SKIP` | `5` | Process 1 frame every N frames to conserve edge CPU |
| `EVIDENCE_DIR` | `evidence` | Local directory for storing snapshot bursts |
| `EVIDENCE_COUNT` | `4` | Number of sequential frames in an incident snapshot burst |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

---

## 3. Configuring Camera Sources and Models

### Test Video or Local File
Place an authorized test MP4 file in the `ai-service` directory:
```env
CAMERA_SOURCE=test_video.mp4
```

### RTSP Stream
For authorized campus CCTV cameras:
```env
CAMERA_SOURCE=rtsp://edge-gateway.internal:554/live/camera-01
```
*Never hardcode stream credentials into repository source code or commit them to Git.*

### Model Path Configuration
- **Standard Detection (`PERSON_MODEL_PATH`)**: Default is `yolov8n.pt`. If placing pre-downloaded weights locally, point to `models/yolov8n.pt`. The service verifies that local paths exist and raises an explicit `FileNotFoundError` if missing.
- **Event Detection (`EVENT_MODEL_PATH`)**: Optional. When omitted, fall and violence detection remain safely inactive to prevent false classifications.

---

## 4. Starting and Stopping the Service

### Run the Service
```bash
python main_edge.py
```

On startup, the service runs a readiness probe:
1. Validates all configuration keys.
2. Checks model weight accessibility.
3. Tests backend health endpoint (`GET /api/v1/health`).
4. Verifies camera stream accessibility and opens the video capture.

### Graceful Shutdown
Send `SIGINT` (Ctrl+C) or `SIGTERM`:
- Closes OpenCV video capture handles cleanly.
- Flushes pending persistence state.
- Frees local memory buffers.

---

## 5. Running Tests

The test suite runs entirely offline using mocks for video capture, YOLO inference, and backend HTTP endpoints (no real cameras, backend server, or model downloads required):

```bash
# Run all unit and integration tests
python -m unittest discover -s tests -v
```

Test coverage includes:
- `test_config.py`: Startup validation and token enforcement.
- `test_stream_handler.py`: Video capture, graceful release, bounded reconnect retries.
- `test_detector.py`: Person, crowd, vehicle, and parking space detection logic.
- `test_persistence_timer.py`: 120-second candidate confirmation and interruption reset.
- `test_alert_rules.py`: Severity assignment, threshold boundaries, rule evaluation.
- `test_screenshot_burst.py`: Frame burst generation and evidence metadata formatting.
- `test_backend_client.py`: Bearer token injection, retry exhaustion with exponential backoff.
- `test_edge_service.py`: Readiness probe and bounded execution loop.

---

## 6. Supported vs. Unsupported Capabilities

### Implemented & Supported
- **People & Vehicle Detection**: Powered by YOLOv8 classes (`person`, `car`, `motorcycle`, `bus`, `truck`, `bicycle`).
- **Crowd Estimation & Alerting**: Real-time people counting compared against `CROWD_CAPACITY` with warning/critical thresholding.
- **Two-Minute Persistence**: Suppresses single-frame and transient spikes, requiring continuous anomaly presence before promoting candidate to backend incident.
- **Snapshot Bursts**: Automatically packages multi-frame bursts with metadata upon verified incident confirmation.
- **Stream Fault Isolation**: Camera read failures and stream disconnects are tracked and retried with bounded delays without crashing the process or confusing stream outages with safety incidents.
- **Backend Authentication**: Secure Bearer token authorization via `Authorization: Bearer <AI_SERVICE_TOKEN>` to `POST /api/v1/ai/events`.

### Unsupported / Gaps
- **Parking Spot Occupancy**: Vehicle counts are reported, but individual spot-level occupancy requires precise camera polygon coordinate maps which are not configured per camera in the backend schema.
- **Fall & Violence Classification**: General YOLO COCO weights lack classes for "fall" or "violence". These detection modes require dedicated fine-tuned action models (`EVENT_MODEL_PATH`).
- **Facial Recognition**: Explicitly prohibited and omitted for campus privacy compliance.
