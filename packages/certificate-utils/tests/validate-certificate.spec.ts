import { createSign } from 'node:crypto';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateKeyPair, KeyAlgorithm } from '../src/generate-key-pair';
import { createCsr } from '../src/create-csr';
import { signCertificate } from '../src/sign-certificate';
import { validateCertificate } from '../src/validate-certificate';

let caKeyPair: ReturnType<typeof generateKeyPair>;
let serviceKeyPair: ReturnType<typeof generateKeyPair>;
let signed: ReturnType<typeof signCertificate>;
let caCertPem: string;

function signNewCert(ttlMs = 3600000) {
  const csr = createCsr({
    commonName: 'validation-test',
    san: ['validation.internal'],
    keyPem: serviceKeyPair.privateKey,
  });

  return signCertificate({
    csr,
    serviceId: 'svc-validate',
    caKeyPair,
    caCertPem,
    ttlMs,
  });
}

beforeAll(() => {
  caKeyPair = generateKeyPair(KeyAlgorithm.EC_P384);
  caCertPem = caKeyPair.publicKey;
  serviceKeyPair = generateKeyPair(KeyAlgorithm.EC_P384);
  signed = signNewCert();
});

describe('validateCertificate', () => {
  it('should return valid for a properly signed certificate', () => {
    const result = validateCertificate(signed.certPem, caCertPem);

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should return invalid for a tampered certificate body', () => {
    const lines = signed.certPem
      .split('\n')
      .filter(l => !l.startsWith('-----BEGIN') && !l.startsWith('-----END'));
    const decoded = Buffer.from(lines.join(''), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    parsed.body = parsed.body + ' TAMPERED';
    const reEncoded = Buffer.from(JSON.stringify(parsed)).toString('base64');
    const tamperedCertPem = `-----BEGIN CERTIFICATE-----\n${reEncoded}\n-----END CERTIFICATE-----`;

    const result = validateCertificate(tamperedCertPem, caCertPem);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature verification failed');
  });

  it('should return invalid for a wrong CA certificate', () => {
    const lines = signed.certPem
      .split('\n')
      .filter(l => !l.startsWith('-----BEGIN') && !l.startsWith('-----END'));
    const decoded = Buffer.from(lines.join(''), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    const wrongCaKey = generateKeyPair(KeyAlgorithm.RSA_4096);
    parsed.issuerCert = wrongCaKey.publicKey;
    const reEncoded = Buffer.from(JSON.stringify(parsed)).toString('base64');
    const tamperedCertPem = `-----BEGIN CERTIFICATE-----\n${reEncoded}\n-----END CERTIFICATE-----`;

    const result = validateCertificate(tamperedCertPem, caCertPem);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature verification failed');
  });

  it('should return invalid for certificate with missing Not After date', () => {
    const body =
      'Serial: SN-001\nSubject: CN=test\nIssuer: CN=CA\nNot Before: 2024-01-01T00:00:00.000Z\nSAN: test.internal';
    const pemContent = Buffer.from(
      JSON.stringify({ body, signature: '', issuerCert: '' })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, '');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Validation error');
  });

  it('should return invalid for certificate with missing Not Before date', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const body =
      'Serial: SN-001\nSubject: CN=test\nIssuer: CN=CA\nNot After: ' +
      futureDate +
      '\nSAN: test.internal';
    const pemContent = Buffer.from(
      JSON.stringify({ body, signature: '', issuerCert: '' })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, '');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Validation error');
  });

  it('should return invalid for malformed PEM input', () => {
    const result = validateCertificate('not-a-pem', 'not-a-ca-pem');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Validation error:');
  });

  it('should return invalid for an empty string', () => {
    const result = validateCertificate('', '');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Validation error:');
  });

  it('should return invalid for truncated PEM data', () => {
    const truncatedPem = signed.certPem.substring(0, 100);

    const result = validateCertificate(truncatedPem, '');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Validation error:');
  });

  it('should return invalid for expired certificate by constructing past dates', () => {
    const certBody = [
      'Serial: SN-EXP',
      'Issuer: CN=TradingModelCA',
      'Subject: CN=expired-service',
      'Not Before: 2020-01-01T00:00:00.000Z',
      'Not After: 2021-01-01T00:00:00.000Z',
      'SAN: expired.internal',
      'Public Key: ' + caCertPem,
    ].join('\n');

    const sign = createSign('sha256');
    sign.update(certBody);
    const signature = sign.sign(caKeyPair.privateKey, 'base64');

    const pemContent = Buffer.from(
      JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, caCertPem);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Certificate expired');
  });

  it('should return invalid for certificate not yet valid', () => {
    const futureYear = (new Date().getFullYear() + 10).toString();
    const certBody = [
      'Serial: SN-FUTURE',
      'Issuer: CN=TradingModelCA',
      'Subject: CN=future-service',
      'Not Before: ' + futureYear + '-01-01T00:00:00.000Z',
      'Not After: ' + (parseInt(futureYear) + 1) + '-01-01T00:00:00.000Z',
      'SAN: future.internal',
      'Public Key: ' + caCertPem,
    ].join('\n');

    const sign = createSign('sha256');
    sign.update(certBody);
    const signature = sign.sign(caKeyPair.privateKey, 'base64');

    const pemContent = Buffer.from(
      JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, caCertPem);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Certificate not yet valid');
  });

  it('should return valid for certificate with current validity window', () => {
    const now = new Date();
    const later = new Date(now.getTime() + 3600000);
    const certBody = [
      'Serial: SN-CURRENT',
      'Issuer: CN=TradingModelCA',
      'Subject: CN=current-service',
      'Not Before: ' + now.toISOString(),
      'Not After: ' + later.toISOString(),
      'SAN: current.internal',
      'Public Key: ' + caCertPem,
    ].join('\n');

    const sign = createSign('sha256');
    sign.update(certBody);
    const signature = sign.sign(caKeyPair.privateKey, 'base64');

    const pemContent = Buffer.from(
      JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, caCertPem);

    expect(result.valid).toBe(true);
  });

  it('should return invalid when cert is signed by different CA key', () => {
    const differentCa = generateKeyPair(KeyAlgorithm.EC_P384);
    const certBody = [
      'Serial: SN-DIFF',
      'Issuer: CN=TradingModelCA',
      'Subject: CN=diff-service',
      'Not Before: 2020-01-01T00:00:00.000Z',
      'Not After: 2030-01-01T00:00:00.000Z',
      'SAN: diff.internal',
      'Public Key: ' + caCertPem,
    ].join('\n');

    const sign = createSign('sha256');
    sign.update(certBody);
    const signature = sign.sign(differentCa.privateKey, 'base64');

    const pemContent = Buffer.from(
      JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })
    ).toString('base64');
    const certPem = '-----BEGIN CERTIFICATE-----\n' + pemContent + '\n-----END CERTIFICATE-----';

    const result = validateCertificate(certPem, caCertPem);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature verification failed');
  });
});
