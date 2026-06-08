import { Router } from 'express';

import { PING_PATH } from '@trading-model/common/server/constants';

import { pingController } from '../ping.controller';

const router = Router();

router.get(PING_PATH, pingController);

/** Express router that mounts the ping health-check endpoint. */
export const pingRoutes = router;
