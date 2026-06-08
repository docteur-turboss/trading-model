import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MessageController } from '../../src/http/messages.controller';
import { EventManager } from '../../src/client/event-manager-client';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('MessageController', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  function makeValidReq() {
    return {
      body: {
        metadata: {
          topic: 'example.debug.create',
          eventType: 'DebugEvent',
          publisher: {
            serviceName: ServiceInstanceName.DiscoveryService,
            instanceId: '550e8400-e29b-41d4-a716-446655440000',
          },
          schemaVersion: '1.0.0',
        },
        payload: { debug: true },
      },
    };
  }

  beforeEach(() => {
    EventManager.removeAllListeners?.();
    req = makeValidReq();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    next = jest.fn();
  });

  it('should process valid message and emit event', async () => {
    const callback = jest.fn();
    EventManager.on('example.debug.create', callback);

    await MessageController(req, res, next);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalledWith({ debug: true });
  });

  it('should throw BadRequest for missing metadata (via catchSync next)', async () => {
    req.body.metadata = undefined;

    await MessageController(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeDefined();
  });

  it('should throw BadRequest for invalid payload', async () => {
    req.body = {
      metadata: {
        topic: 'example.debug.create',
        eventType: 'DebugEvent',
        publisher: {
          serviceName: ServiceInstanceName.DiscoveryService,
          instanceId: '550e8400-e29b-41d4-a716-446655440000',
        },
        schemaVersion: '1.0.0',
      },
      payload: { invalid: 'data' },
    };

    await MessageController(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeDefined();
  });

  it('should handle void events (no payload data)', async () => {
    const callback = jest.fn();
    EventManager.on('example.show.create', callback);

    req = {
      body: {
        metadata: {
          topic: 'example.show.create',
          eventType: 'ShowEvent',
          publisher: {
            serviceName: ServiceInstanceName.DiscoveryService,
            instanceId: '550e8400-e29b-41d4-a716-446655440000',
          },
          schemaVersion: '1.0.0',
        },
        payload: undefined,
      },
    };

    await MessageController(req, res, next);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalled();
  });
});
