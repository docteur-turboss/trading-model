import { describe, it, expect } from '@jest/globals';
import {
  AddressManagerBaseError,
  ServiceNotFoundError,
  ServiceUnreachableError,
  AuthenticationError,
  AddressManagerError,
  MessageManagerBaseError,
  MessageManagerError,
  MetadataBuilderError,
  TimeoutError,
  NackError,
  DeadLetterError,
  AgentBaseError,
  AgentError,
} from '../../src/utils/errors';

describe('Error classes', () => {
  describe('AddressManagerBaseError', () => {
    it('should be constructable via subclass', () => {
      const error = new ServiceNotFoundError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AddressManagerBaseError);
      expect(error.name).toBe('ServiceNotFoundError');
    });

    it('should store cause', () => {
      const cause = new Error('root');
      const error = new ServiceNotFoundError('test', cause);
      expect(error.cause).toBe(cause);
    });

    it('should store cause when undefined', () => {
      const error = new ServiceNotFoundError('test');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('ServiceNotFoundError', () => {
    it('should have correct name and message', () => {
      const error = new ServiceNotFoundError('Service X not found');
      expect(error.name).toBe('ServiceNotFoundError');
      expect(error.message).toBe('Service X not found');
    });
  });

  describe('ServiceUnreachableError', () => {
    it('should have correct name', () => {
      const error = new ServiceUnreachableError('Cannot reach');
      expect(error.name).toBe('ServiceUnreachableError');
    });

    it('should be instanceof AddressManagerBaseError', () => {
      const error = new ServiceUnreachableError('down');
      expect(error).toBeInstanceOf(AddressManagerBaseError);
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct name', () => {
      const error = new AuthenticationError('Invalid token');
      expect(error.name).toBe('AuthenticationError');
    });
  });

  describe('AddressManagerError', () => {
    it('should have correct name', () => {
      const error = new AddressManagerError('Generic error');
      expect(error.name).toBe('AddressManagerError');
    });
  });

  describe('MessageManagerBaseError', () => {
    it('should be constructable via subclass', () => {
      const error = new MessageManagerError('msg');
      expect(error).toBeInstanceOf(MessageManagerBaseError);
    });

    it('should store cause', () => {
      const cause = new Error('root cause');
      const error = new MessageManagerError('msg', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('MessageManagerError', () => {
    it('should have correct name', () => {
      const error = new MessageManagerError('Failed');
      expect(error.name).toBe('MessageManagerError');
    });
  });

  describe('MetadataBuilderError', () => {
    it('should have correct name', () => {
      const error = new MetadataBuilderError('Missing field');
      expect(error.name).toBe('MetadataBuilderError');
    });

    it('should be instanceof MessageManagerBaseError', () => {
      const error = new MetadataBuilderError('err');
      expect(error).toBeInstanceOf(MessageManagerBaseError);
    });
  });

  describe('TimeoutError', () => {
    it('should have correct name', () => {
      const error = new TimeoutError('timed out');
      expect(error.name).toBe('TimeoutError');
    });

    it('should be instanceof MessageManagerBaseError', () => {
      const error = new TimeoutError('timeout');
      expect(error).toBeInstanceOf(MessageManagerBaseError);
    });
  });

  describe('NackError', () => {
    it('should have correct name and reason', () => {
      const error = new NackError('custom reason');
      expect(error.name).toBe('NackError');
      expect(error.reason).toBe('custom reason');
      expect(error.message).toBe('custom reason');
    });

    it('should use default message when reason is undefined', () => {
      const error = new NackError();
      expect(error.reason).toBeUndefined();
      expect(error.message).toBe('Message negatively acknowledged');
    });

    it('should store cause', () => {
      const cause = new Error('root');
      const error = new NackError('reason', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('DeadLetterError', () => {
    it('should have correct name and reason', () => {
      const error = new DeadLetterError('custom reason');
      expect(error.name).toBe('DeadLetterError');
      expect(error.reason).toBe('custom reason');
      expect(error.message).toBe('custom reason');
    });

    it('should use default message when reason is undefined', () => {
      const error = new DeadLetterError();
      expect(error.reason).toBeUndefined();
      expect(error.message).toBe('Message sent to dead letter queue');
    });

    it('should store cause', () => {
      const cause = new Error('root');
      const error = new DeadLetterError('reason', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('AgentBaseError', () => {
    it('should be constructable via subclass', () => {
      const error = new AgentError('agent error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AgentBaseError);
      expect(error.name).toBe('AgentError');
    });

    it('should store cause', () => {
      const cause = new Error('root');
      const error = new AgentError('msg', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('AgentError', () => {
    it('should have correct name', () => {
      const error = new AgentError('ML failure');
      expect(error.name).toBe('AgentError');
      expect(error.message).toBe('ML failure');
    });
  });
});
