import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockRouter = {
  get: jest.fn(),
};
const mockController = { listEvents: jest.fn(), getEvent: jest.fn(), getStats: jest.fn() };

jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter),
}));

jest.mock('../../../src/controllers/events.controller', () => ({
  createEventsController: jest.fn(() => mockController),
}));

import { eventsRoutes } from '../../../src/routes/events.routes';

describe('eventsRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register GET routes for events', () => {
    const auditRepo = {} as any;

    const router = eventsRoutes(auditRepo);

    expect(router).toBe(mockRouter);
    expect(mockRouter.get).toHaveBeenCalledWith('/events', mockController.listEvents);
    expect(mockRouter.get).toHaveBeenCalledWith('/events/stats', mockController.getStats);
    expect(mockRouter.get).toHaveBeenCalledWith('/events/:messageId', mockController.getEvent);
  });
});
