import { Request, Response } from 'express';
import { ResponseException } from '@trading-model/common/middleware/response-exception';

export const pingController = (_: Request, res: Response) => {
  const response = ResponseException('pong').OK();

  return res.status(response.status).json(response.data);
};
