/**
 * Mobile Campus Feature Services
 * Integrates directly with existing backend /api/v1 feature endpoints
 */

import apiClient from './apiClient.js';
import { isStaff } from '../constants/permissions.js';

export const parkingApi = {
  async list(params) {
    const res = await apiClient.get('/parking', { params });
    return res?.data?.parking || [];
  },
  async getById(id) {
    const res = await apiClient.get(`/parking/${id}`);
    return res?.data?.parking || null;
  },
};

export const occupancyApi = {
  async list(params) {
    const res = await apiClient.get('/occupancy', { params });
    return res?.data?.occupancy || [];
  },
  async getById(id) {
    const res = await apiClient.get(`/occupancy/${id}`);
    return res?.data?.occupancy || null;
  },
};

export const incidentApi = {
  async list(params) {
    const res = await apiClient.get('/incidents', { params });
    return res?.data?.incidents || [];
  },
  async getById(id) {
    const res = await apiClient.get(`/incidents/${id}`);
    return res?.data?.incident || null;
  },
  async updateStatus(id, status) {
    const res = await apiClient.patch(`/incidents/${id}/status`, { status });
    return res?.data?.incident || null;
  },
};

export const cameraApi = {
  async list(params) {
    const res = await apiClient.get('/cameras', { params });
    return res?.data?.cameras || [];
  },
  async getById(id) {
    const res = await apiClient.get(`/cameras/${id}`);
    return res?.data?.camera || null;
  },
};

export const notificationApi = {
  async list(params) {
    const res = await apiClient.get('/notifications', { params });
    return res?.data?.notifications || [];
  },
  async markRead(id) {
    const res = await apiClient.patch(`/notifications/${id}/read`);
    return res?.data?.notification || null;
  },
  async markAllRead() {
    const res = await apiClient.patch('/notifications/read-all');
    return res?.data || null;
  },
};

/**
 * Consolidates role-authorized metrics for high-level mobile dashboard summaries
 * @param {object} user - Authenticated user object
 * @returns {Promise<object>}
 */
export async function getDashboardSummary(user) {
  const role = user?.role;
  const staff = isStaff(role);

  // Execute requests in parallel based on authorization
  const promises = [
    parkingApi.list().catch(() => []),
    occupancyApi.list().catch(() => []),
  ];

  if (staff) {
    promises.push(incidentApi.list().catch(() => []));
    promises.push(cameraApi.list().catch(() => []));
  }

  const results = await Promise.all(promises);

  const parking = results[0] || [];
  const occupancy = results[1] || [];
  const incidents = staff ? results[2] || [] : [];
  const cameras = staff ? results[3] || [] : [];

  // Calculate parking sums
  const totalParkingCapacity = parking.reduce((sum, p) => sum + (Number(p.totalSpaces) || 0), 0);
  const totalOccupiedParking = parking.reduce((sum, p) => sum + (Number(p.occupiedSpaces) || 0), 0);
  const totalAvailableParking = parking.reduce(
    (sum, p) => sum + (Number(p.availableSpaces ?? (p.totalSpaces - p.occupiedSpaces)) || 0),
    0
  );

  // Calculate camera metrics (staff only)
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter((c) => c.status === 'online').length;

  // Calculate incidents metrics (staff only)
  const openIncidents = incidents.filter((i) => ['new', 'acknowledged', 'investigating'].includes(i.status));
  const criticalIncidents = incidents.filter(
    (i) => i.severity === 'critical' && ['new', 'acknowledged', 'investigating'].includes(i.status)
  );

  return {
    parking,
    occupancy,
    cameras: staff ? cameras : [],
    incidents: staff ? incidents : [],
    metrics: {
      totalParkingCapacity,
      totalOccupiedParking,
      totalAvailableParking,
      totalCameras,
      onlineCameras,
      openIncidentsCount: openIncidents.length,
      criticalIncidentsCount: criticalIncidents.length,
    },
  };
}

export default {
  parkingApi,
  occupancyApi,
  incidentApi,
  cameraApi,
  notificationApi,
  getDashboardSummary,
};
