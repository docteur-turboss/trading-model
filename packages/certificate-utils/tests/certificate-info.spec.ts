import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateKeyPair, KeyAlgorithm } from '../src/generate-key-pair';
import { createCsr } from '../src/create-csr';
import { signCertificate } from '../src/sign-certificate';
import { certificateInfo } from '../src/certificate-info';

let signed: ReturnType<typeof signCertificate>;

beforeAll(() => {
  const caKeyPair = generateKeyPair(KeyAlgorithm.EC_P384);
  const caCertPem = caKeyPair.publicKey;
  const serviceKeyPair = generateKeyPair(KeyAlgorithm.EC_P384);
  const csr = createCsr({
    commonName: 'info-test',
    san: ['info1.internal', 'info2.internal'],
    keyPem: serviceKeyPair.privateKey,
  });

  signed = signCertificate({
    csr,
    serviceId: 'svc-info',
    caKeyPair,
    caCertPem,
    ttlMs: 3600000,
  });
});

function makeCertPem(body: string): string {
  const pemContent = Buffer.from(
    JSON.stringify({ body, signature: 'fakesig', issuerCert: '' })
  ).toString('base64');

  return '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';
}

describe('certificateInfo', () => {
  it('should extract serial number', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.serialNumber).toBe(signed.serialNumber);
  });

  it('should extract subject CN', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.subject).toBe('CN=info-test');
  });

  it('should extract issuer CN', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.issuer).toBe('CN=TradingModelCA');
  });

  it('should extract validity dates', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.notBefore.getTime()).toBe(signed.issuedAt.getTime());
    expect(info.notAfter.getTime()).toBe(signed.expiresAt.getTime());
  });

  it('should compute fingerprint', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.fingerprint).toBe(signed.fingerprint);
  });

  it('should extract SAN entries', () => {
    const info = certificateInfo(signed.certPem);

    expect(info.san).toEqual(['info1.internal', 'info2.internal']);
  });

  it('should return empty string for missing serial number', () => {
    const body =
      'Subject: CN=test\nIssuer: CN=CA\nNot Before: 2024-01-01T00:00:00.000Z\nNot After: 2025-01-01T00:00:00.000Z\nSAN: test.internal';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.serialNumber).toBe('');
  });

  it('should return empty string for missing subject', () => {
    const body =
      'Serial: SN-001\nIssuer: CN=CA\nNot Before: 2024-01-01T00:00:00.000Z\nNot After: 2025-01-01T00:00:00.000Z\nSAN: test.internal';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.subject).toBe('');
  });

  it('should return empty string for missing issuer', () => {
    const body =
      'Serial: SN-001\nSubject: CN=test\nNot Before: 2024-01-01T00:00:00.000Z\nNot After: 2025-01-01T00:00:00.000Z\nSAN: test.internal';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.issuer).toBe('');
  });

  it('should return Invalid Date for missing notBefore', () => {
    const body =
      'Serial: SN-001\nSubject: CN=test\nIssuer: CN=CA\nNot After: 2025-01-01T00:00:00.000Z\nSAN: test.internal';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.notBefore.getTime()).toBeNaN();
  });

  it('should return Invalid Date for missing notAfter', () => {
    const body =
      'Serial: SN-001\nSubject: CN=test\nIssuer: CN=CA\nNot Before: 2024-01-01T00:00:00.000Z\nSAN: test.internal';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.notAfter.getTime()).toBeNaN();
  });

  it('should return empty SAN when none present', () => {
    const body =
      'Serial: SN-001\nSubject: CN=test\nIssuer: CN=CA\nNot Before: 2024-01-01T00:00:00.000Z\nNot After: 2025-01-01T00:00:00.000Z\nSAN: ';
    const pem = makeCertPem(body);

    const info = certificateInfo(pem);

    expect(info.san).toEqual([]);
  });
});
