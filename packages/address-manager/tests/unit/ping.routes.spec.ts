import { describe, it, expect } from '@jest/globals';
import { pingRoutes } from '../../src/http/routes/ping.routes';

describe('pingRoutes', () => {
  it('should export a router', () => {
    expect(pingRoutes).toBeDefined();
  });
});
