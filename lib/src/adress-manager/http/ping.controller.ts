import { Request, Response } from "express";
import { ResponseException } from "../../common/middleware/responseException";

export const pingController = (_: Request, res: Response) => {
  const response = ResponseException("pong").OK()

  return res.status(response.status).json(response.data);
}