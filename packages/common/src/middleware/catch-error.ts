import { NextFunction, Request, Response } from 'express';

import { ResponseObject } from './response-exception';

/**
 * Wraps an asynchronous Express handler and forwards any thrown errors
 * to the `next()` function. This avoids the need for manual try/catch
 * blocks inside each async route.
 *
 * If the handler returns a {@link ResponseObject}, it is sent directly
 * as the HTTP response instead of using exceptions for normal control flow.
 *
 * @param errorFunction - The asynchronous route handler to wrap.
 * @returns A new function compatible with Express (req, res, next)
 *          that automatically catches and forwards errors.
 *
 * @example
 * router.get(
 *   "/users",
 *   catchSync(async (req, res) => {
 *     const users = await UserService.getAllUsers();
 *     res.json(users);
 *   })
 * );
 */
export const catchSync =
  (
    errorFunction: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => void | ResponseObject | Promise<ResponseObject | void>
  ) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await Promise.resolve(errorFunction(req, res, next));
      if (result && typeof result === 'object' && 'status' in result) {
        res
          .status(result.status)
          .type('json')
          .send((result as ResponseObject).data);
      }
    } catch (err) {
      next(err);
    }
  };
