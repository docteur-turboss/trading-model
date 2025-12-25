import { ResponseProtocole } from "cash-lib/middleware/responseProtocole";
import { rateLimit } from "express-rate-limit";
import express, { Router } from "express";
import helmet from "helmet";

/**
 * Express application instance.
 * This file is responsible only for HTTP server configuration
 * (middlewares, routes wiring, global error handling).
 *
 * Business logic must NOT live here.
 */
const app = express();

/**
 * -------------------------
 * Security Middlewares
 * -------------------------
 *
 * helmet():
 * Adds a set of HTTP headers to protect against well-known
 * web vulnerabilities (XSS, clickjacking, MIME sniffing, etc.).
 *
 * These headers are applied globally to all routes.
 */
app.use(helmet());

/**
 * -------------------------
 * Body Parsers
 * -------------------------
 *
 * express.json():
 * Parses incoming requests with JSON payloads and makes the
 * parsed body available on req.body.
 *
 * express.urlencoded():
 * Parses application/x-www-form-urlencoded payloads.
 * extended: true allows rich objects and arrays via qs library.
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * -------------------------
 * Rate Limiting
 * -------------------------
 *
 * Protects the API against:
 * - brute force attacks
 * - accidental traffic spikes
 * - abusive clients
 *
 * This limiter is IP-based and applies to all routes.
 * In production, limits should be adjusted according to:
 * - expected traffic
 * - trust level (internal vs public)
 * - deployment topology (proxy / load balancer)
 */
const limiter = rateLimit({
  // Time window in milliseconds
  windowMs: 15 * 6,

  // Maximum number of requests allowed per IP during the window
  limit: 1,

  // Response message returned when the limit is exceeded
  message: "Too many requests from this IP, please try again later.",
});

app.use(limiter);

/**
 * -------------------------
 * Routes Registration
 * -------------------------
 *
 * Centralized route mounting.
 * Each feature exposes its own Router and is mounted here.
 *
 * This approach:
 * - keeps the app.ts file clean
 * - enforces modularity
 * - simplifies testing and maintenance
 */
const apiRoutes: [string, Router][] = [
  ["/registry", require('../controllers/Register.controller').registryRoutes],
  ["/registry", require('../controllers/Heartbeat.controller').heartbeatRoutes],
];

/**
 * Iterates over all declared routes and mounts them on the app.
 */
apiRoutes.forEach(([path, router]) => app.use(path, router));

/**
 * -------------------------
 * Global Error Handling
 * -------------------------
 *
 * ResponseProtocole is a centralized error / response formatter.
 * It ensures:
 * - consistent response structure
 * - proper HTTP status codes
 * - no unhandled errors leaking stack traces
 *
 * This middleware MUST be registered last.
 */
app.use(ResponseProtocole);

export { app };