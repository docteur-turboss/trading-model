import { Router } from 'express';

import { metricsController } from '../metrics.controller';

const router = Router();

router.get('/metrics', metricsController);

export const metricsRoutes = router;
