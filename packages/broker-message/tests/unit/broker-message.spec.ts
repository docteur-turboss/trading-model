import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventManager } from '../../src/client/event-manager-client';

const mockMessageManagerClientInstance = {
  SubscribeToTopics: jest.fn(),
  UnSubscribeToTopic: jest.fn(),
  publishDirectMessage: jest.fn(),
  publishAsyncMessage: jest.fn(),
};

jest.mock('../../src/client/message-manager-client', () => ({
  MessageManagerClient: jest.fn().mockImplementation(() => mockMessageManagerClientInstance),
}));

jest.mock('@trading-model/common/config/http-client', () => ({
  HttpClient: Object.assign(
    jest.fn().mockImplementation(() => ({})),
    { createWithTls: jest.fn(() => ({})) }
  ),
}));

const mockCreateCallbackRoute = jest.fn();

jest.mock('../../src/http/messages.routes', () => ({
  CreateCallbackRoute: jest.fn(() => mockCreateCallbackRoute),
}));

import BrokerMessage from '../../src/index';

describe('BrokerMessage', () => {
  let broker: any;

  const defaultParams: any = {
    instanceId: '550e8400-e29b-41d4-a716-446655440000',
    RootCACertPath: '/path/to/ca.pem',
    CertificatePath: '/path/to/cert.pem',
    KeyCertificatePath: '/path/to/key.pem',
    addressManagerClient: { findService: jest.fn() },
    serviceName: 'MessageDeliveryService',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    EventManager.removeAllListeners?.();
    broker = new BrokerMessage(defaultParams);
  });

  describe('constructor', () => {
    it('should create instance with all params', () => {
      expect(broker).toBeInstanceOf(BrokerMessage);
    });

    it('should use default callbackPath when not provided', () => {
      const { MessageManagerClient } = require('../../src/client/message-manager-client');
      expect(MessageManagerClient).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ callbackPath: 'message' }),
        expect.any(Object)
      );
    });

    it('should use provided callbackPath', () => {
      const { MessageManagerClient } = require('../../src/client/message-manager-client');
      jest.clearAllMocks();
      new BrokerMessage({ ...defaultParams, callbackPath: '/custom' } as any);
      expect(MessageManagerClient).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ callbackPath: '/custom' }),
        expect.any(Object)
      );
    });
  });

  describe('intents', () => {
    it('should call SubscribeToTopics with topics', async () => {
      const topics = ['example.debug.create'];
      await broker.intents(topics);
      expect(mockMessageManagerClientInstance.SubscribeToTopics).toHaveBeenCalledWith(topics);
      expect(broker.topics).toEqual(topics);
    });
  });

  describe('stopMessageManager', () => {
    it('should call UnSubscribeToTopic with topics', async () => {
      const topics = ['example.debug.create'];
      broker.topics = topics;
      await broker.stopMessageManager();
      expect(mockMessageManagerClientInstance.UnSubscribeToTopic).toHaveBeenCalledWith(topics);
    });

    it('should call kill functions from event array', async () => {
      const killFn = jest.fn();
      (broker as any).cleanupFns = [killFn];
      await broker.stopMessageManager();
      expect(killFn).toHaveBeenCalled();
    });

    it('should set topics to null', async () => {
      broker.topics = ['example.debug.create'];
      await broker.stopMessageManager();
      expect(broker.topics).toBeNull();
    });
  });

  describe('on', () => {
    it('should register an event listener and push kill function', () => {
      const listener = jest.fn();
      const initialLength = (broker as any).cleanupFns.length;
      broker.on('example.debug.create', listener);
      expect((broker as any).cleanupFns.length).toBe(initialLength + 1);
    });

    it('should trigger listener when event is emitted', () => {
      const listener = jest.fn();
      broker.on('example.debug.create', listener);
      EventManager.emit('example.debug.create', { debug: true });
      expect(listener).toHaveBeenCalledWith({ debug: true });
    });
  });

  describe('listenExpress', () => {
    it('should call app.use with CreateCallbackRoute result', () => {
      const app = { use: jest.fn() };
      broker.listenExpress(app as any);
      expect(app.use).toHaveBeenCalledWith(mockCreateCallbackRoute);
    });
  });

  describe('post', () => {
    describe('direct', () => {
      it('should call publishDirectMessage', async () => {
        const metadata = {
          topic: 'test',
          eventType: 'test',
          publisher: {
            serviceName: 'DiscoveryService',
            instanceId: '550e8400-e29b-41d4-a716-446655440000',
          },
        };
        await broker.post.direct('MessageDeliveryService', { data: 'test' }, metadata);
        expect(mockMessageManagerClientInstance.publishDirectMessage).toHaveBeenCalledWith(
          'MessageDeliveryService',
          { data: 'test' },
          metadata
        );
      });
    });

    describe('indirect', () => {
      it('should call publishAsyncMessage', async () => {
        const metadata = {
          topic: 'test',
          eventType: 'test',
          publisher: {
            serviceName: 'DiscoveryService',
            instanceId: '550e8400-e29b-41d4-a716-446655440000',
          },
        };
        await broker.post.indirect({ data: 'test' }, metadata);
        expect(mockMessageManagerClientInstance.publishAsyncMessage).toHaveBeenCalledWith(
          { data: 'test' },
          metadata
        );
      });
    });
  });

  describe('helper export', () => {
    it('should export MetadataBuilder', () => {
      const BrokerMessageModule = require('../../src/index');
      expect(BrokerMessageModule.helper.MetadataBuilder).toBeDefined();
    });
  });
});
