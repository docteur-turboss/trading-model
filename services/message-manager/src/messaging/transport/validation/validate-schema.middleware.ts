import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export const validateSchema = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    req.body = parsed.data;
    next();
  };
};
