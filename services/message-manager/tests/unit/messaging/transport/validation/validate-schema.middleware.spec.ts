import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { validateSchema } from '../../../../../src/messaging/transport/validation/validate-schema.middleware';
import { Request, Response } from 'express';

describe('validateSchema', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it('should call next() when validation succeeds and set req.body to parsed data', () => {
    const middleware = validateSchema(testSchema);
    const req = { body: { name: 'Alice', age: 30 } } as Request;
    const res = {} as Response;
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('should return 400 when validation fails', () => {
    const middleware = validateSchema(testSchema);
    const req = { body: { name: 'Alice' } } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });
});
