import { Request, Response } from 'express';

import { sendResponse } from '@trading-model/common/middleware/response-exception';

export const metricsController = (req: Request, res: Response) => {
  const snapshot = req.app.locals.metricsSnapshot as (() => Record<string, unknown>) | undefined;
  const data = snapshot ? snapshot() : {};
  const response = sendResponse(data, 200);
  return res.status(response.status).json(response.data);
};
