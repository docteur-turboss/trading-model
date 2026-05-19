/**
 * @fileoverview Trader-Trainer Service
 *
 * Autonomous trading AI agents trained via Genetic Algorithm + Deep Q-Learning.
 * This module provides the main entry point for the service.
 *
 * @author Docteur Turboss
 * @version 1.0.0
 */

import app from './server';

const PORT = process.env.PORT || 3000;

/**
 * Start the Trader-Trainer service.
 *
 * The service initializes a genetic algorithm that evolves trading agents.
 * Agents receive real market data from the Message-Manager service.
 *
 * @listens PORT
 */
const server = app.listen(PORT, () => {
  console.log(`[Trader-Trainer] Service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[Trader-Trainer] SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('[Trader-Trainer] HTTP server closed');
    process.exit(0);
  });
});

export default server;
