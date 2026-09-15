import { Router } from "express";

import { metricsController } from "../metrics.controller";

const ROUTER = Router();

ROUTER.get("/status", metricsController);

export const STATUS_ROUTES = ROUTER;
