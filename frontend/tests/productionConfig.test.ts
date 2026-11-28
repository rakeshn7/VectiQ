import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { parseApiError, resolveApiBaseUrl } from '@/services/api';

// 1. Production build with configured HTTPS backend URL strips trailing slashes cleanly
const prodConfigured = resolveApiBaseUrl({
  viteApiBaseUrl: 'https://vectiq-backend-production.up.railway.app///',
  isProd: true,
});
assert.equal(prodConfigured.baseUrl, 'https://vectiq-backend-production.up.railway.app');
assert.equal(prodConfigured.isMissingProdConfig, false);

// 2. Production build without VITE_API_BASE_URL must NEVER silently fall back to localhost:8000
const prodMissing = resolveApiBaseUrl({
  viteApiBaseUrl: '',
  isProd: true,
});
assert.equal(prodMissing.baseUrl, '');
assert.equal(prodMissing.isMissingProdConfig, true);

// 3. Local dev without VITE_API_BASE_URL defaults cleanly to http://localhost:8000
const devDefault = resolveApiBaseUrl({
  viteApiBaseUrl: undefined,
  isProd: false,
});
assert.equal(devDefault.baseUrl, 'http://localhost:8000');
assert.equal(devDefault.isMissingProdConfig, false);

// 4. Optional runtime override supersedes build-time URL
const runtimeOverride = resolveApiBaseUrl({
  viteApiBaseUrl: 'https://old-backend.up.railway.app',
  runtimeApiBaseUrl: 'https://new-backend.up.railway.app/',
  isProd: true,
});
assert.equal(runtimeOverride.baseUrl, 'https://new-backend.up.railway.app');
assert.equal(runtimeOverride.isMissingProdConfig, false);

// 5. Missing prod API config surfaces explicit client-side diagnostic error instead of fake network hang
const parsedMissing = parseApiError(
  new AxiosError(
    'Backend API URL is not configured for production (VITE_API_BASE_URL is unset).',
    'ERR_MISSING_API_CONFIG'
  )
);
assert.equal(parsedMissing.code, 'MISSING_API_CONFIG');
assert.equal(parsedMissing.isNetworkError, true);
assert.match(parsedMissing.message, /VITE_API_BASE_URL/);

console.log('PASSED: Production API URL & config checks (5/5)');
