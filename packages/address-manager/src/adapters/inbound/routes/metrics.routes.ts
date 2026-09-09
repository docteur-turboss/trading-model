import { Router } from "express";

import { metricsController } from "../metrics.controller";

const ROUTER = Router();

ROUTER.get("/metrics", metricsController);

export const METRICS_ROUTES = ROUTER;
