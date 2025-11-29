import { NextFunction, Request, Response } from "express";

/**
 * Wraps an asynchronous Express handler and forwards any thrown errors 
 * to the `next()` function. This avoids the need for manual try/catch 
 * blocks inside each async route.
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
export const catchSync = (errorFunction : (req : Request, res : Response, next : NextFunction) => void) => async (req : Request, res : Response, next : NextFunction) => {
  // Ensures that both synchronous and asynchronous errors
  // are caught and passed to Express' default error handler.
  Promise.resolve(errorFunction(req, res, next)).catch(next);
}