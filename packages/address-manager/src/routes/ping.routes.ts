import { PING_PATH } from "@trading-model/http/shared/constants";
import { Router } from "express";

import { pingController } from "../ping.controller";

const ROUTER = Router();

ROUTER.get(PING_PATH, pingController);

/** Express router that mounts the ping health-check endpoint. */
export const PING_ROUTES = ROUTER;
