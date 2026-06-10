import { describe, it, expect } from '@jest/globals';

import { MessagePayloadSchema } from '../../src/shared/helper/messages/message.schema';

describe('MessagePayloadSchema', () => {
  describe('auditHeartbeat', () => {
    it('should accept valid heartbeat payload', () => {
      const result = MessagePayloadSchema.parse({
        type: 'audit.heartbeat' as const,
        data: { serviceName: 'audit-logger', instanceId: 'inst-1' },
      });
      expect(result).toBeDefined();
      expect((result.data as any).serviceName).toBe('audit-logger');
    });

    it('should reject heartbeat without instanceId', () => {
      expect(() =>
        MessagePayloadSchema.parse({
          type: 'audit.heartbeat' as const,
          data: { serviceName: 'audit-logger' },
        }),
      ).toThrow();
    });
  });

  describe('auditGapDetected', () => {
    it('should accept valid gap detected payload', () => {
      const result = MessagePayloadSchema.parse({
        type: 'audit.gap.detected' as const,
        data: {
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-02T00:00:00Z',
          lostCount: 5,
        },
      });
      expect(result).toBeDefined();
      const data = result.data as any;
      expect(data.from).toBeInstanceOf(Date);
      expect(data.to).toBeInstanceOf(Date);
      expect(data.lostCount).toBe(5);
    });

    it('should accept gap detected without optional lostCount', () => {
      const result = MessagePayloadSchema.parse({
        type: 'audit.gap.detected' as const,
        data: {
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-02T00:00:00Z',
        },
      });
      expect((result.data as any).lostCount).toBeUndefined();
    });
  });
});