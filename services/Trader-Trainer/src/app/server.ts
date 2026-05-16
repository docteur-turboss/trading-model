/**
 * @fileoverview Express Server Configuration
 * 
 * Sets up the HTTP server with security middleware and health check endpoints.
 * Serves as the entry point for the Trader-Trainer microservice.
 * 
 * @requires express
 * @requires helmet
 * @requires cash-lib/middleware
 */

import helmet from 'helmet';
import express, { Request, Response } from 'express';
import { catchSync } from 'cash-lib/middleware/catchError';
import { ResponseException } from 'cash-lib/middleware/responseException';
import { ResponseProtocole } from 'cash-lib/middleware/responseProtocole';

const app = express();

/**
 * Security Middlewares
 * 
 * Helmet provides various HTTP headers to protect from common vulnerabilities.
 */
app.use(helmet());

/**
 * Body Parsing & Request Processing
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health Check Endpoint
 * 
 * Returns service status. Used for monitoring and load balancer health checks.
 * 
 * @route GET /ping
 * @returns {Object} Service status response
 */
app.get('/ping', catchSync(async (req: Request, res: Response) => {
  const response = ResponseException('Service en ligne').Success();
  res.status(response.status).json({ data: response.data });
}));

/**
 * 404 Not Found Handler
 * 
 * Catches undefined routes and returns appropriate error response.
 * 
 * @route All other routes
 * @returns {Object} Not found error response
 */
app.use(/(.*)/, catchSync(async (req: Request, res: Response) => {
  const response = ResponseException('Chemin ou méthode non supporté.').NotFound();
  res.status(response.status).json({ data: response.data });
}));

/**
 * Global Error Handler
 * 
 * Catches any unhandled errors and formats them according to ResponseProtocole.
 */
app.use(ResponseProtocole);

export default app;