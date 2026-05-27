import axios from 'axios'

// In dev: VITE_API_URL=http://localhost:8000 (set in .env.development)
// In prod: empty string → same-domain API calls (served by FastAPI)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  timeout: 90000, // 90s — Claude API can take up to ~45s with large prompts
})

// Intercept requests to attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Intercept 401 responses → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
