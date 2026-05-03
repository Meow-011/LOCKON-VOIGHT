/**
 * API service — Axios client for VOIGHT backend communication.
 */

import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('voight_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh
      const refreshToken = localStorage.getItem('voight_refresh_token');
      if (refreshToken && !error.config._retried) {
        error.config._retried = true;
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          localStorage.setItem('voight_access_token', res.data.access_token);
          localStorage.setItem('voight_refresh_token', res.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(error.config);
        } catch {
          localStorage.removeItem('voight_access_token');
          localStorage.removeItem('voight_refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ──────── Auth ────────
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  setup: (username, password, display_name) =>
    api.post('/auth/setup', { username, password, display_name }),
  needsSetup: () => api.get('/auth/needs-setup'),
  me: () => api.get('/auth/me'),
};

// ──────── Settings ────────
export const settingsAPI = {
  get: () => api.get('/settings/'),
  update: (data) => api.post('/settings/', data),
  uploadDashboardBanner: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/settings/upload-banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteDashboardBanner: () => api.delete('/settings/banner'),
};

// ──────── Competitions ────────
export const competitionsAPI = {
  list: (status) =>
    api.get('/competitions/', { params: status ? { status } : {} }),
  get: (id) => api.get(`/competitions/${id}`),
  create: (data) => api.post('/competitions/', data),
  update: (id, data) => api.patch(`/competitions/${id}`, data),
  delete: (id) => api.delete(`/competitions/${id}`),
  listContestants: (competitionId) =>
    api.get(`/competitions/${competitionId}/contestants`),
  addContestant: (competitionId, data) =>
    api.post(`/competitions/${competitionId}/contestants`, data),
  uploadBanner: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/competitions/upload-banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

// ──────── Contestants ────────
export const contestantsAPI = {
  get: (id) => api.get(`/contestants/${id}`),
  update: (id, data) => api.patch(`/contestants/${id}`, data),
  delete: (id) => api.delete(`/contestants/${id}`),
  getScores: (id, limit = 50) =>
    api.get(`/contestants/${id}/scores`, { params: { limit } }),
  getIncidents: (id, status) =>
    api.get(`/contestants/${id}/incidents`, { params: status ? { status } : {} }),
  getResources: (id) => api.get(`/contestants/${id}/resources`),
  getActivity: (id) => api.get(`/contestants/${id}/activity`),
  sendWarning: (id) => api.post(`/contestants/${id}/warning`),
};

// ──────── Incidents ────────
export const incidentsAPI = {
  list: (competitionId, status, limit = 100) =>
    api.get('/incidents/', {
      params: {
        ...(competitionId && { competition_id: competitionId }),
        ...(status && { status }),
        limit,
      },
    }),
  get: (id) => api.get(`/incidents/${id}`),
  review: (id, status, review_note) =>
    api.patch(`/incidents/${id}/review`, { status, review_note }),
  getTrend: (hours = 24) => api.get('/incidents/trend/hourly', { params: { hours } }),
  getMatrix: () => api.get('/incidents/matrix'),
};

// ──────── Health ────────
export const healthAPI = {
  check: () => api.get('/health'),
  getDbHealth: () => api.get('/health/db'),
  getSetupStatus: () => api.get('/auth/setup-status'),
  setup: (username, password) => api.post('/auth/setup', { username, password }),
};

// ──────── Policy ────────
export const policyAPI = {
  get: () => api.get('/policy/'),
  update: (data) => api.put('/policy/', data),
};

// ──────── Users (Proctor Management) ────────
export const usersAPI = {
  list: () => api.get('/auth/users'),
  create: (data) => api.post('/auth/register', data),
  update: (id, data) => api.patch(`/auth/users/${id}`, data),
  delete: (id) => api.delete(`/auth/users/${id}`),
};

// ──────── Agents (Fleet) ────────
export const agentsAPI = {
  list: () => api.get('/contestants/'),
};

// ──────── Incident Trend ────────
export const incidentTrendAPI = {
  hourly: (hours = 24) => api.get('/incidents/trend/hourly', { params: { hours } }),
};

export default api;
