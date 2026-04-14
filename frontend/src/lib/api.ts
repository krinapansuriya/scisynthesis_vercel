import axios from 'axios';

const api = axios.create({
  // Relative URL — Vite dev server proxies /api/* to the FastAPI backend.
  // Same-origin means httpOnly cookies are sent automatically.
  baseURL: '/api/v1',
  withCredentials: true,
});

// Fallback: if a token is stored in sessionStorage (set by AuthContext on login),
// attach it as a Bearer header. This covers cases where the httpOnly cookie
// is not forwarded correctly (e.g. during first request after login).
// sessionStorage is cleared when the tab closes — safer than localStorage.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('ss_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
