// Barrel export for @trading-model/common
// Use deep imports for tree-shaking: import { ... } from '@trading-model/common/config/logger'

// === server/ — Bootstrap & HTTPS infra ===
export { createBootstrap } from './server/bootstrap';
export { createSecureServer } from './server/create-secure-server';
export { configureApp } from './server/configure-app';
export { SERVER_DEFAULTS } from './server/constants';
export { serverFactory } from './server/server-factory';

// === middleware/ — Express middleware ===
export { MTLSAuthMiddleware } from './middleware/mtls-auth';
export { handleCoreError } from './middleware/handle-core-error';
export { ResponseException } from './middleware/response-exception';

// === config/ — Logger & HTTP client ===
export { logger } from './config/logger';
export { HttpClient } from './config/http-client';

// === validation/ — Zod schemas & env ===
export { BaseEnvSchema, validateEnv } from './validation/env';

// === crypto/ — Secure random & tokens ===
export { secureRandom } from './crypto/random';

// === contracts/ — Shared type contracts ===
export type { ServiceInstance } from './contracts/service-registry.types';

// === utils/ — General utilities ===
export { sleep } from './utils/sleep';
