import { Request, Response } from 'express';

import { sendResponse } from '@trading-model/common/middleware/response-exception';

/** Handles GET /ping requests. Returns a "pong" response to indicate the service is alive. */
export const pingController = (_: Request, res: Response) => {
  const response = sendResponse('pong', 201);

  return res.status(response.status).json(response.data);
};
