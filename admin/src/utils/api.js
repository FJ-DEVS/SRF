import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/login');

    // A 401 on a normal request means the session is gone — including the case
    // where the admin just deleted the account behind it. Send the user back to
    // the login screen that matches their role.
    if (error.response?.status === 401 && !isLoginRequest) {
      let role;
      try {
        role = JSON.parse(localStorage.getItem('user') || 'null')?.role;
      } catch {
        role = undefined;
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');

      const target = role === 'roller' ? '/roller/login' : '/login';
      if (window.location.pathname !== target) {
        window.location.href = target;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

