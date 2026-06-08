import { describe, it, expect } from '@jest/globals';
import { AppError, ErrorCodes, normalizeError } from '../../src/utils/errors';

describe('AppError', () => {
  it('should be constructable with message and code', () => {
    const error = new AppError('test', ErrorCodes.SERVICE_NOT_FOUND);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('test');
    expect(error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('should store cause', () => {
    const cause = new Error('root');
    const error = new AppError('test', ErrorCodes.SERVICE_NOT_FOUND, { cause });
    expect(error.cause).toBe(cause);
  });

  it('should have cause undefined when not provided', () => {
    const error = new AppError('test', ErrorCodes.SERVICE_NOT_FOUND);
    expect(error.cause).toBeUndefined();
  });

  it('should set constructor name for correct error chain', () => {
    const error = new AppError('Service X not found', ErrorCodes.SERVICE_NOT_FOUND);
    expect(error.name).toBe('AppError');
  });

  it('should have correct code for SERVICE_NOT_FOUND', () => {
    const error = new AppError('Service X not found', ErrorCodes.SERVICE_NOT_FOUND);
    expect(error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('should have correct code for SERVICE_UNREACHABLE', () => {
    const error = new AppError('Cannot reach', ErrorCodes.SERVICE_UNREACHABLE);
    expect(error.code).toBe('SERVICE_UNREACHABLE');
  });

  it('should have correct code for AUTHENTICATION_ERROR', () => {
    const error = new AppError('Invalid token', ErrorCodes.AUTHENTICATION_ERROR);
    expect(error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should have correct code for ADDRESS_MANAGER_ERROR', () => {
    const error = new AppError('Generic error', ErrorCodes.ADDRESS_MANAGER_ERROR);
    expect(error.code).toBe('ADDRESS_MANAGER_ERROR');
  });

  it('should have correct code for MESSAGE_MANAGER_ERROR', () => {
    const error = new AppError('Failed', ErrorCodes.MESSAGE_MANAGER_ERROR);
    expect(error.code).toBe('MESSAGE_MANAGER_ERROR');
  });

  it('should have correct code for METADATA_BUILDER_ERROR', () => {
    const error = new AppError('Missing field', ErrorCodes.METADATA_BUILDER_ERROR);
    expect(error.code).toBe('METADATA_BUILDER_ERROR');
  });

  it('should have correct code for TIMEOUT_ERROR', () => {
    const error = new AppError('timed out', ErrorCodes.TIMEOUT_ERROR);
    expect(error.code).toBe('TIMEOUT_ERROR');
  });

  it('should support reason via options', () => {
    const error = new AppError('custom reason', ErrorCodes.NACK_ERROR, { reason: 'custom reason' });
    expect(error.code).toBe('NACK_ERROR');
    expect(error.reason).toBe('custom reason');
    expect(error.message).toBe('custom reason');
  });

  it('should support NACK_ERROR without reason', () => {
    const error = new AppError('Message negatively acknowledged', ErrorCodes.NACK_ERROR);
    expect(error.reason).toBeUndefined();
    expect(error.message).toBe('Message negatively acknowledged');
  });

  it('should store cause with NACK_ERROR', () => {
    const cause = new Error('root');
    const error = new AppError('reason', ErrorCodes.NACK_ERROR, { reason: 'reason', cause });
    expect(error.cause).toBe(cause);
    expect(error.reason).toBe('reason');
  });

  it('should support DEAD_LETTER_ERROR with reason', () => {
    const error = new AppError('custom reason', ErrorCodes.DEAD_LETTER_ERROR, {
      reason: 'custom reason',
    });
    expect(error.code).toBe('DEAD_LETTER_ERROR');
    expect(error.reason).toBe('custom reason');
    expect(error.message).toBe('custom reason');
  });

  it('should support DEAD_LETTER_ERROR without reason', () => {
    const error = new AppError('Message sent to dead letter queue', ErrorCodes.DEAD_LETTER_ERROR);
    expect(error.reason).toBeUndefined();
    expect(error.message).toBe('Message sent to dead letter queue');
  });

  it('should store cause with DEAD_LETTER_ERROR', () => {
    const cause = new Error('root');
    const error = new AppError('reason', ErrorCodes.DEAD_LETTER_ERROR, { reason: 'reason', cause });
    expect(error.cause).toBe(cause);
    expect(error.reason).toBe('reason');
  });

  it('should have correct code for AGENT_ERROR', () => {
    const error = new AppError('agent error', ErrorCodes.AGENT_ERROR);
    expect(error.code).toBe('AGENT_ERROR');
  });

  it('should store cause with AGENT_ERROR', () => {
    const cause = new Error('root');
    const error = new AppError('msg', ErrorCodes.AGENT_ERROR, { cause });
    expect(error.cause).toBe(cause);
  });

  it('should have correct message and code for AGENT_ERROR', () => {
    const error = new AppError('ML failure', ErrorCodes.AGENT_ERROR);
    expect(error.code).toBe('AGENT_ERROR');
    expect(error.message).toBe('ML failure');
  });

  describe('normalizeError', () => {
    it('should return Error instance unchanged', () => {
      const err = new Error('test');
      expect(normalizeError(err)).toBe(err);
    });

    it('should wrap string in Error', () => {
      const result = normalizeError('something broke');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('something broke');
    });

    it('should wrap object with message property', () => {
      const result = normalizeError({ message: 'object error' });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('object error');
    });

    it('should wrap unknown type with default message', () => {
      const result = normalizeError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Unknown error: 42');
    });
  });
});
