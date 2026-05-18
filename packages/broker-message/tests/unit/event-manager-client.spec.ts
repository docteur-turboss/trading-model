import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventManager } from '../../src/client/eventManagerClient';

describe('EventManager', () => {
  beforeEach(() => {
    EventManager.removeAllListeners?.();
  });

  describe('on', () => {
    it('should register a listener for an event', () => {
      const callback = jest.fn();

      EventManager.on('example.debug.create', callback);

      (EventManager as any).emit('example.debug.create', { debug: true });

      expect(callback).toHaveBeenCalledWith({ debug: true });
    });

    it('should register multiple listeners for the same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      (EventManager as any).on('test.event', callback1);
      (EventManager as any).on('test.event', callback2);

      (EventManager as any).emit('test.event', { id: 'txn-123' });

      expect(callback1).toHaveBeenCalledWith({ id: 'txn-123' });
      expect(callback2).toHaveBeenCalledWith({ id: 'txn-123' });
    });

    it('should return an unsubscribe function', () => {
      const callback = jest.fn();

      const unsubscribe = (EventManager as any).on('test.event', callback);

      (EventManager as any).emit('test.event', { id: 'user-1' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      (EventManager as any).emit('test.event', { id: 'user-2' });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove a listener from an event', () => {
      const callback = jest.fn();

      (EventManager as any).on('test.event', callback);
      (EventManager as any).off('test.event', callback);

      (EventManager as any).emit('test.event', { service: 'trader' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should only remove the specified listener', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      (EventManager as any).on('test.event', callback1);
      (EventManager as any).on('test.event', callback2);

      (EventManager as any).off('test.event', callback1);

      (EventManager as any).emit('test.event', { id: 'txn-456' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith({ id: 'txn-456' });
    });
  });

  describe('emit', () => {
    it('should call all listeners for an event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      (EventManager as any).on('test.event', callback1);
      (EventManager as any).on('test.event', callback2);

      const data = { id: 'user-999', name: 'John' };
      (EventManager as any).emit('test.event', data);

      expect(callback1).toHaveBeenCalledWith(data);
      expect(callback2).toHaveBeenCalledWith(data);
    });

    it('should not call listeners for other events', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      (EventManager as any).on('event.a', callback1);
      (EventManager as any).on('event.b', callback2);

      (EventManager as any).emit('event.a', { id: '1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should handle events with no listeners gracefully', () => {
      expect(() => {
        (EventManager as any).emit('nonexistent.event', { data: 'test' });
      }).not.toThrow();
    });

    it('should support void events (no data)', () => {
      const callback = jest.fn();

      EventManager.on('example.show.create', callback);
      EventManager.emit('example.show.create');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Listener lifecycle', () => {
    it('should handle rapid subscribe/unsubscribe cycles', () => {
      const callback = jest.fn();

      for (let i = 0; i < 5; i++) {
        const unsubscribe = (EventManager as any).on('test.event', callback);
        unsubscribe();
      }

      (EventManager as any).emit('test.event', { iteration: 1 });
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle errors in listener callbacks gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalCallback = jest.fn();

      (EventManager as any).on('error.event', errorCallback);
      (EventManager as any).on('error.event', normalCallback);

      let errorWasThrown = false;
      try {
        (EventManager as any).emit('error.event', { test: true });
      } catch (error) {
        errorWasThrown = true;
      }

      expect(errorCallback).toHaveBeenCalled();
      expect(errorWasThrown).toBe(true);
    });
  });
});
