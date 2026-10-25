# 🏫 Smart Campus Monitoring System

### AI-Powered Campus Monitoring and Intelligent Surveillance

Smart Campus Monitoring System is an intelligent campus monitoring solution designed to improve campus safety, visibility, and operational efficiency through artificial intelligence, computer vision, and real-time data processing.

Traditional CCTV systems primarily record video footage, leaving security personnel and administrators to manually monitor multiple cameras to understand what is happening. This project aims to transform passive surveillance into intelligent monitoring by detecting activities, identifying crowding conditions, monitoring vehicle activity, and generating timely alerts.

The goal is to provide a centralized platform that helps educational institutions make informed decisions and respond more efficiently to campus conditions.

---

## 🎯 Project Objectives

- Transform traditional CCTV systems into intelligent monitoring solutions.
- Provide real-time visibility into crowd and vehicle activity.
- Help identify overcrowding in campus areas.
- Improve parking-area monitoring and vehicle visibility.
- Reduce the workload associated with continuous manual camera monitoring.
- Generate timely notifications for configured incidents.
- Provide administrators with a centralized monitoring dashboard.
- Build a scalable foundation for future smart campus applications.

---

## ✨ Key Features

### 📹 Intelligent Camera Monitoring

The system is designed to work with compatible camera sources and analyze video frames using computer vision. It aims to provide meaningful information from camera feeds instead of relying exclusively on recorded footage.

### 👥 Crowd Detection and Monitoring

The AI service detects people in supported camera frames and can identify when the number of visible people exceeds a configured threshold.

This feature can help campus staff monitor busy locations such as:

- Canteens and cafeterias
- Corridors and entrances
- Common areas
- Campus gathering spaces
- Other monitored locations

### 🚗 Smart Parking and Vehicle Monitoring

The system supports vehicle detection for monitored parking areas. Depending on the configured detection model, supported classes can include cars, motorcycles, buses, and trucks.

Vehicle-count alerts can help staff identify areas with high vehicle activity. Actual parking-space occupancy requires additional logic, such as defining individual parking spaces and determining whether each space is occupied.

### 🚨 Incident Detection and Alerts

The platform is designed to generate alerts when supported detection rules are triggered.

Incident information can be presented through the monitoring dashboard, helping authorized personnel review events and respond appropriately.

### ⚡ Real-Time Dashboard Updates

Real-time communication allows supported events and notifications to be delivered to connected clients without requiring a complete page refresh for every update.

The dashboard serves as a central interface for viewing available monitoring information.

### 📧 Email Notifications

The system supports email notifications for configured events. This can help authorized staff become aware of important incidents even when they are not actively watching the dashboard.

### 🖥️ Centralized Campus Monitoring

The project brings together camera analysis, backend services, event handling, and dashboard functionality into a single application architecture.

The intended result is a more organized way to review monitoring events across supported campus locations.

### 📱 Mobile Application

A mobile application built with React Native and Expo forms part of the project. It provides a foundation for extending supported monitoring functionality to mobile devices as the application develops.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Web application interface |
| Vite | Frontend development and build tooling |
| Tailwind CSS | Interface styling |
| React Router | Frontend navigation |
| Node.js | Backend runtime |
| Express.js | Backend API framework |
| Socket.IO | Real-time communication |
| MongoDB | Application data storage |
| Mongoose | MongoDB object modeling |
| Python | AI service development |
| FastAPI | AI service API framework |
| OpenCV | Computer vision and video processing |
| Ultralytics YOLO | Object detection |
| PyTorch | Machine learning framework |
| React Native | Mobile application development |
| Expo | Mobile development tooling |
| Git and GitHub | Version control and collaboration |

---

## 🏗️ System Architecture

The application is organized into several major components:

- **Frontend:** Provides the web dashboard and user interface.
- **Backend:** Manages application APIs, business logic, data access, and real-time events.
- **AI Service:** Processes supported camera frames and performs object detection.
- **Database:** Stores application information and supported incident records.
- **Real-Time Layer:** Communicates supported events to connected clients.
- **Mobile Application:** Provides a foundation for mobile access to supported functionality.
- **Shared Contracts:** Help define data structures exchanged between application components.

These components work together to turn supported camera observations into information that can be reviewed by authorized users.

---

## 📂 Project Structure

The repository contains the major application components:

```text
smart-campus-monitoring/
│
├── ai-service/    # AI and computer vision
├── backend/       # APIs and application logic
├── frontend/      # Web dashboard
├── mobile/        # Mobile application
├── shared/        # Shared data contracts
├── .gitignore
├── package.json
└── README.md
```

The exact contents of each directory may evolve as new features are developed.

---

## 🏫 Target Users

The project is intended to support different campus stakeholders:

- **Campus Administrators:** Gain a centralized view of supported campus monitoring events.
- **Security Personnel:** Review alerts and investigate reported incidents.
- **Department Heads:** Receive relevant notifications and monitor conditions in their areas of responsibility.
- **Facility Management Teams:** Use available information to help coordinate campus operations.
- **Students and Visitors:** May benefit indirectly from improved campus operations and visibility, subject to the access and features provided by the institution.

Access to monitoring information should be restricted according to each user's responsibilities.

---

## 💡 Problems the Project Addresses

### Manual CCTV Monitoring

Watching many camera feeds continuously requires time and attention. Automated detection can help highlight selected events for human review.

### Overcrowded Campus Areas

Busy campus spaces can become difficult to manage during peak hours. Crowd detection can provide an additional source of information about activity levels.

### Limited Parking Visibility

Drivers and campus staff may lack an immediate overview of vehicle activity. Vehicle detection can help provide better visibility into monitored parking areas.

### Delayed Incident Awareness

When monitoring depends entirely on a person noticing an event, some situations may go unnoticed. Configured automated alerts can help bring selected events to attention sooner.

### Fragmented Monitoring Information

A centralized dashboard can make supported alerts and event information easier for authorized staff to review in one place.

---

## 🔒 Security and Responsible Monitoring

The project is intended to support campus safety while respecting privacy and responsible data handling.

Important principles include:

- Restrict access to authorized users.
- Protect camera footage and incident evidence.
- Secure authentication and application communications.
- Use monitoring data only for appropriate purposes.
- Establish suitable evidence-retention policies.
- Avoid treating automated detections as definitive proof of wrongdoing.
- Ensure that monitoring practices comply with applicable laws and institutional policies.

---

## 🔮 Future Scope

The project can be extended with additional smart campus capabilities, including:

- Individual parking-space occupancy detection
- Camera connection and health monitoring
- Historical crowd and vehicle activity analytics
- Campus maps with camera locations
- Configurable alert rules for different campus areas
- Improved incident prioritization
- Mobile push notifications
- Enhanced reporting and data visualization
- Additional computer vision models
- Performance optimization for edge devices and GPU hardware
- More comprehensive integration and real-world testing

These enhancements represent potential future development and may not all be implemented in the current version.

---

## 🌟 Project Vision

The vision of Smart Campus Monitoring System is to make campus monitoring more intelligent, responsive, and accessible to authorized personnel.

By combining computer vision, real-time communication, and modern application development, the project explores how existing camera infrastructure can provide useful operational information rather than serving only as a recording system.

**From passive CCTV recording to intelligent campus monitoring.**

---

## 👨‍💻 About

Smart Campus Monitoring System is a software project focused on AI-powered surveillance assistance, real-time campus insights, crowd monitoring, and parking activity detection.

Built using modern web, mobile, backend, and computer vision technologies, the project aims to explore practical applications of artificial intelligence in educational environments.
