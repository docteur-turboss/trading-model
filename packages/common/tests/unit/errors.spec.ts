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
} from '../../src/utils/Errors';

describe('Error classes', () => {
  describe('AddressManagerBaseError', () => {
    it('should be abstract but constructable via subclass', () => {
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
  });

  describe('ServiceNotFoundError', () => {
    it('should have correct name', () => {
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
  });
});
