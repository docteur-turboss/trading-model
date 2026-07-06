// Barrel export for @trading-model/common
// Use deep imports for tree-shaking: import { ... } from '@trading-model/common/config/logger'

export { HttpClient } from "./config/http-client";
// === config/ — Logger & HTTP client ===
export { logger } from "./config/logger";
// === contracts/ — Shared type contracts ===
export type { ServiceInstance } from "./contracts/service-registry.types";
// === crypto/ — Secure random & tokens ===
export { generateRandomStr as secureRandom } from "./crypto/random";
export type { TradingSymbol } from "./domain/primitives";
export type { RevocationRequest } from "./domain/revocation-request";
export { handleCoreError } from "./middleware/handle-core-error";

// === middleware/ — Express middleware ===
export { MTLSAuthMiddleware } from "./middleware/mtls-auth";
export { ResponseException } from "./middleware/response-exception";
// === server/ — Bootstrap & HTTPS infra ===
export { createBootstrap } from "./server/bootstrap";
export { configureApp } from "./server/configure-app";
export { PING_PATH } from "./server/constants";
export { createSecureServer } from "./server/create-secure-server";
export {
	createAndStartHttpsServer,
	setupTlsWatcher,
} from "./server/server-factory";
// === utils/ — General utilities ===
export { sleep } from "./utils/sleep";
// === validation/ — Zod schemas & env ===
export { BaseEnvSchema, validateEnv } from "./validation/env";
// === ws/ — WebSocket interfaces ===
export type { IWsConnection } from "./ws/i-ws-connection";
export type { IWsReconnector } from "./ws/i-ws-reconnector";
