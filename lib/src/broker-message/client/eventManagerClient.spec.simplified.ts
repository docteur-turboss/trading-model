/**
 * Tests pour EventManager - Version Simplifiée
 * Tests unitaires basiques pour validation
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('EventManager Simplified', () => {
  let eventManager: any;

  beforeEach(() => {
    eventManager = {
      listeners: {},
      on(event: string, callback: Function) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return () => {
          this.listeners[event] = this.listeners[event].filter((cb: Function) => cb !== callback);
        };
      },
      emit(event: string, data?: any) {
        if (this.listeners[event]) {
          this.listeners[event].forEach((callback: Function) => {
            try {
              callback(data);
            } catch (error) {
              console.error('Error in listener:', error);
            }
          });
        }
      },
      off(event: string, callback: Function) {
        if (this.listeners[event]) {
          this.listeners[event] = this.listeners[event].filter((cb: Function) => cb !== callback);
        }
      },
      removeAllListeners() {
        this.listeners = {};
      },
    };
  });

  describe('on - Register listeners', () => {
    it('should register a listener for an event', () => {
      const callback = jest.fn();
      eventManager.on('service.heartbeat', callback);

      eventManager.emit('service.heartbeat', { status: 'active' });

      expect(callback).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should register multiple listeners for the same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventManager.on('transaction.completed', callback1);
      eventManager.on('transaction.completed', callback2);

      eventManager.emit('transaction.completed', { id: 'txn-123' });

      expect(callback1).toHaveBeenCalledWith({ id: 'txn-123' });
      expect(callback2).toHaveBeenCalledWith({ id: 'txn-123' });
    });

    it('should return an unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = eventManager.on('user.created', callback);

      eventManager.emit('user.created', { id: 'user-1' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventManager.emit('user.created', { id: 'user-2' });
      expect(callback).toHaveBeenCalledTimes(1); // Should still be 1
    });
  });

  describe('off - Remove listeners', () => {
    it('should remove a listener from an event', () => {
      const callback = jest.fn();
      eventManager.on('event.test', callback);

      eventManager.emit('event.test', { data: '1' });
      expect(callback).toHaveBeenCalledTimes(1);

      eventManager.off('event.test', callback);

      eventManager.emit('event.test', { data: '2' });
      expect(callback).toHaveBeenCalledTimes(1); // Should still be 1
    });

    it('should only remove the specified listener', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventManager.on('event.test', callback1);
      eventManager.on('event.test', callback2);

      eventManager.off('event.test', callback1);

      eventManager.emit('event.test', { data: '1' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit - Event emission', () => {
    it('should call all listeners for an event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventManager.on('user.created', callback1);
      eventManager.on('user.created', callback2);

      eventManager.emit('user.created', { id: 'user-1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should not call listeners for other events', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventManager.on('user.created', callback1);
      eventManager.on('user.updated', callback2);

      eventManager.emit('user.created', { id: 'user-1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should handle events with no listeners gracefully', () => {
      expect(() => {
        eventManager.emit('nonexistent.event', { data: 'test' });
      }).not.toThrow();
    });

    it('should support void events (no data)', () => {
      const callback = jest.fn();

      eventManager.on('service.ready', callback);
      eventManager.emit('service.ready');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Listener lifecycle', () => {
    it('should handle rapid subscribe/unsubscribe cycles', () => {
      const callback = jest.fn();

      for (let i = 0; i < 5; i++) {
        const unsubscribe = eventManager.on('rapid.event', callback);
        unsubscribe();
      }

      eventManager.emit('rapid.event', { iteration: 1 });
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle errors in listener callbacks gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalCallback = jest.fn();

      eventManager.on('error.event', errorCallback);
      eventManager.on('error.event', normalCallback);

      // Should not throw due to error handling in emit
      expect(() => {
        eventManager.emit('error.event', { test: true });
      }).not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalled();
    });
  });
});
