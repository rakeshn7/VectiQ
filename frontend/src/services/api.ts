import axios from 'axios';

/**
 * Axios client instance for Semantic Space Studio
 * Configured with environment variable VITE_API_BASE_URL (defaults to http://localhost:8000)
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Response interceptor for consistent error handling foundation
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standard error logging for development
    console.error('[API Error]:', error?.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
