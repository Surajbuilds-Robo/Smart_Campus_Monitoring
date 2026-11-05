const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../modules/users/user.model");
const Camera = require("../../modules/cameras/camera.model");
const Parking = require("../../modules/parking/parking.model");
const Occupancy = require("../../modules/occupancy/occupancy.model");
const Incident = require("../../modules/incidents/incident.model");

const engineeringDeptId = new mongoose.Types.ObjectId("65f1a2b3c4d5e6f7a8b9c0d1");

/**
 * Seeds initial administrative users required for application operation.
 * Operational data (cameras, live metrics, incidents, AI detections) is strictly omitted
 * unless running in an isolated automated test environment.
 */
async function seedInitialData(options = {}) {
  try {
    const isTest = options.isTest || process.env.NODE_ENV === "test";
    const userCount = await User.countDocuments();

    if (userCount === 0) {
      console.log("Database initialized without accounts. Seeding initial administrative credentials...");

      const salt = await bcrypt.genSalt(10);
      const superAdminHash = await bcrypt.hash("Admin@123456", salt);
      const securityHash = await bcrypt.hash("Security@123456", salt);
      const deptHeadHash = await bcrypt.hash("DeptHead@123456", salt);
      const facultyHash = await bcrypt.hash("Faculty@123456", salt);
      const studentHash = await bcrypt.hash("Student@123456", salt);

      await User.create([
        {
          name: "Campus Operations Administrator",
          email: "admin@campus.edu",
          passwordHash: superAdminHash,
          role: "SUPER_ADMIN",
          departmentId: null,
          isActive: true,
        },
        {
          name: "Campus Security Officer",
          email: "security@campus.edu",
          passwordHash: securityHash,
          role: "SECURITY",
          departmentId: null,
          isActive: true,
        },
        {
          name: "Dr. Eleanor Vance",
          email: "depthead@campus.edu",
          passwordHash: deptHeadHash,
          role: "DEPT_HEAD",
          departmentId: engineeringDeptId,
          isActive: true,
        },
        {
          name: "Prof. Marcus Brody",
          email: "faculty@campus.edu",
          passwordHash: facultyHash,
          role: "FACULTY",
          departmentId: engineeringDeptId,
          isActive: true,
        },
        {
          name: "Alex Rivera",
          email: "student@campus.edu",
          passwordHash: studentHash,
          role: "STUDENT",
          departmentId: null,
          isActive: true,
        },
      ]);

      console.log("Initial administrative accounts provisioned:");
      console.log("  - Super Admin: admin@campus.edu / Admin@123456");
      console.log("  - Security:    security@campus.edu / Security@123456");
      console.log("  - Dept Head:   depthead@campus.edu / DeptHead@123456");
      console.log("  - Faculty:     faculty@campus.edu / Faculty@123456");
      console.log("  - Student:     student@campus.edu / Student@123456");
    }

    // Isolated test fixtures strictly for automated test suites
    if (isTest) {
      await seedTestFixtures();
    }
  } catch (err) {
    console.warn("Notice during initial data seed:", err.message);
  }
}

/**
 * Isolated test fixtures for automated testing only.
 * Will never be executed in development or production runtime.
 */
async function seedTestFixtures() {
  const existingCam001 = await Camera.findOne({ cameraId: "CAM-001" });
  if (existingCam001) return;


  const cameras = await Camera.create([
    {
      name: "Test North Campus Entrance",
      cameraId: "CAM-001",
      location: "Gate 1 - North Boulevard",
      building: "Main Gatehouse",
      status: "online",
      lastHeartbeat: new Date(),
      isActive: true,
    },
    {
      name: "Test Central Library Plaza",
      cameraId: "CAM-002",
      location: "Library Courtyard Ground Floor",
      building: "Central Library",
      status: "online",
      lastHeartbeat: new Date(),
      isActive: true,
    },
    {
      name: "Test Science & Engineering Complex",
      cameraId: "CAM-003",
      location: "Engineering Hall Atrium",
      building: "Block C",
      departmentId: engineeringDeptId,
      status: "online",
      lastHeartbeat: new Date(),
      isActive: true,
    },
    {
      name: "Test West Student Parking Lot",
      cameraId: "CAM-004",
      location: "Perimeter Sector 4",
      building: "West Deck",
      status: "online",
      lastHeartbeat: new Date(),
      isActive: true,
    },
    {
      name: "Test Athletics Pavilion",
      cameraId: "CAM-005",
      location: "South Sports Center",
      building: "Athletic Complex",
      status: "offline",
      lastHeartbeat: new Date(Date.now() - 3600000),
      isActive: true,
    },
  ]);

  await Parking.create([
    {
      name: "Test North Visitor Lot",
      zoneId: "ZONE-LOT-A",
      location: "North Gate Entrance",
      building: "Gatehouse North",
      totalSpaces: 120,
      occupiedSpaces: 52,
      availableSpaces: 68,
      status: "available",
    },
    {
      name: "Test Faculty Parking Deck",
      zoneId: "ZONE-LOT-B",
      location: "Academic Quadrangle",
      building: "Central Admin Deck",
      totalSpaces: 200,
      occupiedSpaces: 184,
      availableSpaces: 16,
      status: "available",
    },
    {
      name: "Test Student Structure",
      zoneId: "ZONE-LOT-C",
      location: "West Residential Sector",
      building: "West Deck",
      totalSpaces: 350,
      occupiedSpaces: 110,
      availableSpaces: 240,
      status: "available",
    },
  ]);

  await Occupancy.create([
    {
      camera: cameras[1]._id,
      cameraId: cameras[1].cameraId,
      zoneName: "Test Library Reading Hall",
      peopleCount: 88,
      capacity: 150,
      occupancyRatio: 0.586,
      level: "normal",
      observedAt: new Date(),
    },
    {
      camera: cameras[2]._id,
      cameraId: cameras[2].cameraId,
      zoneName: "Test Engineering Center Atrium",
      peopleCount: 172,
      capacity: 200,
      occupancyRatio: 0.86,
      level: "warning",
      observedAt: new Date(),
    },
  ]);

  await Incident.create([
    {
      incidentId: "INC-2026-001",
      eventType: "crowd_overcrowding",
      severity: "warning",
      status: "new",
      camera: cameras[2]._id,
      departmentId: engineeringDeptId,
      description: "Automated test fixture: crowd density elevated.",
      confidence: 0.91,
    },
    {
      incidentId: "INC-2026-002",
      eventType: "parking_violation",
      severity: "info",
      status: "acknowledged",
      camera: cameras[3]._id,
      description: "Automated test fixture: vehicle parking test.",
      confidence: 0.88,
    },
  ]);
}

module.exports = { seedInitialData, seedTestFixtures };
