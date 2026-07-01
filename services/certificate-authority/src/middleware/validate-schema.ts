import { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validateSchema(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = (
        result.error as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }
      ).issues;
      const details = issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    req.body = result.data;
    next();
  };
}
