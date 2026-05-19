import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MessageManagerClient } from '../../src/client/message-manager-client';
import { MessageManagerError, ServiceUnreachableError } from '@trading-model/common/utils/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MessageManagerClient', () => {
  let client: MessageManagerClient;
  let httpClient: any;
  let addressManagerClient: any;

  const mockConfig = {
    serviceName: 'TestService',
    callbackPath: '/message',
    instanceId: '550e8400-e29b-41d4-a716-446655440000',
  };

  const mockServiceInstance = {
    ip: '192.168.1.100',
    port: 3001,
  };

  beforeEach(() => {
    httpClient = {
      post: jest.fn(),
      delete: jest.fn(),
    };
    addressManagerClient = {
      findService: jest.fn(),
    };
    client = new MessageManagerClient(httpClient, mockConfig as any, addressManagerClient as any);
  });

  describe('SubscribeToTopics', () => {
    it('should subscribe to a single topic successfully', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockResolvedValue(undefined);

      await client.SubscribeToTopics(['example.debug.create']);

      expect(addressManagerClient.findService).toHaveBeenCalled();
      expect(httpClient.post).toHaveBeenCalledWith(
        'https://192.168.1.100:3001/subscribe',
        expect.objectContaining({
          topic: 'example.debug.create',
          callbackPath: mockConfig.callbackPath,
        })
      );
    });

    it('should subscribe to multiple topics', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockResolvedValue(undefined);

      await client.SubscribeToTopics(['example.debug.create', 'example.show.create']);

      expect(httpClient.post).toHaveBeenCalledTimes(2);
    });

    it('should throw ServiceUnreachableError when service not found', async () => {
      addressManagerClient.findService.mockResolvedValue(null);

      await expect(client.SubscribeToTopics(['example.debug.create'])).rejects.toThrow(
        ServiceUnreachableError
      );
    });

    it('should swallow MessageManagerError on subscription failure', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockRejectedValue(new Error('Network error'));

      const result = await client.SubscribeToTopics(['example.debug.create']);
      expect(result).toBeUndefined();
    });
  });

  describe('UnSubscribeToTopic', () => {
    it('should unsubscribe from topics', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.delete.mockResolvedValue(undefined);

      await client.UnSubscribeToTopic(['example.debug.create']);

      expect(httpClient.delete).toHaveBeenCalled();
    });
  });

  describe('publishAsyncMessage', () => {
    it('should publish an async message', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockResolvedValue(undefined);

      const metadata = {
        eventType: 'test',
        topic: 'test.event',
        schemaVersion: '1.0.0',
        publisher: { serviceName: 'TestService', instanceId: 'uuid' },
      } as any;
      await client.publishAsyncMessage({ hello: 'world' }, metadata);

      expect(httpClient.post).toHaveBeenCalledWith('https://192.168.1.100:3001/message', {
        payload: { hello: 'world' },
        metadata,
      });
    });

    it('should throw MessageManagerError on publish failure', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockRejectedValue(new Error('Publish failed'));

      await expect(client.publishAsyncMessage({}, {} as any)).rejects.toThrow(MessageManagerError);
    });
  });

  describe('publishDirectMessage', () => {
    it('should publish a direct message', async () => {
      addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
      httpClient.post.mockResolvedValue(undefined);

      const metadata = {
        eventType: 'test',
        topic: 'test.event',
        schemaVersion: '1.0.0',
        publisher: { serviceName: 'TestService', instanceId: 'uuid' },
      } as any;
      await client.publishDirectMessage('MessageDeliveryService', { data: 'test' }, metadata);

      expect(httpClient.post).toHaveBeenCalled();
    });
  });
});
