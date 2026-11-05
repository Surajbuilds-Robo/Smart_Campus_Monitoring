import apiClient from "./apiClient.js";

export const cameraApi = {
  list: (params) => apiClient.get("/cameras", { params }).then((res) => res.data?.data?.cameras || []),
  getById: (id) => apiClient.get(`/cameras/${id}`).then((res) => res.data?.data?.camera),
  getStream: (id) => apiClient.get(`/cameras/${id}/stream`).then((res) => res.data?.data?.stream),
  getStreamTicket: (id) => apiClient.get(`/cameras/${id}/stream-ticket`).then((res) => res.data?.data),
  getAnalytics: (id) => apiClient.get(`/cameras/${id}/analytics`).then((res) => res.data?.data?.analytics),
  create: (data) => apiClient.post("/cameras", data).then((res) => res.data?.data?.camera),
  update: (id, data) => apiClient.patch(`/cameras/${id}`, data).then((res) => res.data?.data?.camera),
  updateStatus: (id, status) => apiClient.patch(`/cameras/${id}`, { status }).then((res) => res.data?.data?.camera),
  delete: (id) => apiClient.delete(`/cameras/${id}`).then((res) => res.data),
  verify: (id) => apiClient.post(`/cameras/${id}/verify`).then((res) => res.data?.data),
  verifyStream: (streamUrl) => apiClient.post("/cameras/verify-stream", { streamUrl }).then((res) => res.data?.data),
  reconnect: (id) => apiClient.post(`/cameras/${id}/reconnect`).then((res) => res.data?.data),
  discover: (id, options = {}) => apiClient.post(`/cameras/${id}/discover`, options).then((res) => res.data?.data),
  announce: (id, data = {}) => apiClient.post(`/cameras/${id}/announce`, data).then((res) => res.data?.data),
  getStreamProxyUrl: (id) => `/api/v1/cameras/${id}/stream-proxy`,
  getAnnotatedStreamUrl: (id) => `/api/v1/cameras/${id}/annotated-stream`,
};

export const incidentApi = {
  list: (params) => apiClient.get("/incidents", { params }).then((res) => res.data?.data?.incidents || []),
  getById: (id) => apiClient.get(`/incidents/${id}`).then((res) => res.data?.data?.incident),
  create: (data) => apiClient.post("/incidents", data).then((res) => res.data?.data?.incident),
  updateStatus: (id, status) =>
    apiClient.patch(`/incidents/${id}/status`, { status }).then((res) => res.data?.data?.incident),
  assign: (id, assignedTo) =>
    apiClient.patch(`/incidents/${id}/assign`, { assignedTo }).then((res) => res.data?.data?.incident),
  retryEmail: (id) =>
    apiClient.post(`/incidents/${id}/retry-email`).then((res) => res.data?.data),
};

export const occupancyApi = {
  list: (params) => apiClient.get("/occupancy", { params }).then((res) => res.data?.data?.occupancy || []),
  getById: (id) => apiClient.get(`/occupancy/${id}`).then((res) => res.data?.data?.occupancy),
};

export const parkingApi = {
  list: (params) => apiClient.get("/parking", { params }).then((res) => res.data?.data?.parking || []),
  getById: (id) => apiClient.get(`/parking/${id}`).then((res) => res.data?.data?.parking),
  create: (data) => apiClient.post("/parking", data).then((res) => res.data?.data?.parking),
  update: (id, data) => apiClient.patch(`/parking/${id}`, data).then((res) => res.data?.data?.parking),
};

export const notificationApi = {
  list: (params) =>
    apiClient.get("/notifications", { params }).then((res) => res.data?.data?.notifications || []),
  markRead: (id) =>
    apiClient.patch(`/notifications/${id}/read`).then((res) => res.data?.data?.notification),
  markAllRead: () => apiClient.patch("/notifications/read-all").then((res) => res.data?.data),
  markAsRead: (id) =>
    apiClient.patch(`/notifications/${id}/read`).then((res) => res.data?.data?.notification),
  markAllAsRead: () => apiClient.patch("/notifications/read-all").then((res) => res.data?.data),
};

export const userApi = {
  list: (params) => apiClient.get("/users", { params }).then((res) => res.data?.data?.users || []),
  getById: (id) => apiClient.get(`/users/${id}`).then((res) => res.data?.data?.user),
  create: (data) => apiClient.post("/users", data).then((res) => res.data?.data?.user),
  update: (id, data) => apiClient.patch(`/users/${id}`, data).then((res) => res.data?.data?.user),
};
