import { describe, it, expect } from '@jest/globals';
import { generateKeyPair, KeyAlgorithm } from '../src/generate-key-pair';

describe('generateKeyPair', () => {
  it('should generate an RSA 4096 key pair', () => {
    const keyPair = generateKeyPair(KeyAlgorithm.RSA_4096);

    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('should generate an EC P-384 key pair', () => {
    const keyPair = generateKeyPair(KeyAlgorithm.EC_P384);

    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should default to EC P-384', () => {
    const keyPair = generateKeyPair();

    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
  });

  it('should return keys in PEM format', () => {
    const keyPair = generateKeyPair(KeyAlgorithm.EC_P384);

    expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(keyPair.publicKey).toContain('-----END PUBLIC KEY-----');
    expect(keyPair.privateKey).toContain('-----END PRIVATE KEY-----');
  });

  it('should generate a unique key pair each time', () => {
    const kp1 = generateKeyPair(KeyAlgorithm.EC_P384);
    const kp2 = generateKeyPair(KeyAlgorithm.EC_P384);

    expect(kp1.privateKey).not.toBe(kp2.privateKey);
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});
