import { Router } from 'express';
import { pingController } from '../ping.controller';

const router = Router();

router.get("/ping", pingController)

export const pingRoutes = router;