import { CsrOptions } from './create-csr';
import { KeyAlgorithm } from './generate-key-pair';
import { getPool } from './lazy-pool';
import { RemoteSigningClient } from './remote-signing-client';
import { SignOptions } from './sign-certificate';
import { KeyPair, KeyPairWithId, SignedCertificate } from './types';
import { ValidationResult } from './validate-certificate';

let remoteClient: RemoteSigningClient | null = null;

export function setRemoteSigningClient(client: RemoteSigningClient | null): void {
  remoteClient = client;
}

export async function generateKeyPairAsync(
  algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384
): Promise<KeyPair> {
  if (remoteClient) return remoteClient.generateKeyPair(algorithm);
  return getPool().execute<KeyPair>('generateKeyPair', { algorithm });
}

export async function generateKeyPairWithIdAsync(
  algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384
): Promise<KeyPairWithId> {
  if (remoteClient) return remoteClient.generateKeyPairWithId(algorithm);
  return getPool().execute<KeyPairWithId>('generateKeyPairWithId', { algorithm });
}

export async function signCertificateAsync(options: SignOptions): Promise<SignedCertificate> {
  if (remoteClient) return remoteClient.signCertificate(options);
  return getPool().execute<SignedCertificate>('signCertificate', options as unknown as Record<string, unknown>);
}

export async function createCsrAsync(options: CsrOptions): Promise<string> {
  if (remoteClient) return remoteClient.createCsr(options);
  return getPool().execute<string>('createCsr', options as unknown as Record<string, unknown>);
}

export async function validateCertificateAsync(
  certPem: string,
  caCertPem?: string
): Promise<ValidationResult> {
  if (remoteClient) return remoteClient.validateCertificate(certPem);
  return getPool().execute<ValidationResult>('validateCertificate', { certPem, caCertPem });
}

export async function parseKeyAsync(privateKey: string): Promise<KeyPair> {
  if (remoteClient) return remoteClient.parseKey(privateKey);
  return getPool().execute<KeyPair>('parseKey', { privateKey });
}

export async function signAsync(
  algorithm: string,
  body: string,
  privateKey: string
): Promise<string> {
  if (remoteClient) return remoteClient.sign(algorithm, body, privateKey);
  return getPool().execute<string>('sign', { algorithm, body, privateKey });
}
