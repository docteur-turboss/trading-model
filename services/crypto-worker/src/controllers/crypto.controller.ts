import { Request, Response } from 'express';

import {
  generateKeyPairAsync,
  generateKeyPairWithIdAsync,
  signCertificateAsync,
  createCsrAsync,
  validateCertificateAsync,
  parseKeyAsync,
  signAsync,
} from '@trading-model/certificate-utils/async';
import { KeyAlgorithm } from '@trading-model/certificate-utils/generate-key-pair';
import { SignOptions } from '@trading-model/certificate-utils/sign-certificate';
import { CsrOptions } from '@trading-model/certificate-utils/create-csr';
import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

function handleError(res: Response, err: unknown): void {
  const message = normalizeError(err).message;
  logger.error('Crypto operation failed', { err: message });
  res.status(500).json({ error: message });
}

export async function generateKeyPairHandler(req: Request, res: Response): Promise<void> {
  try {
    const algorithm = (req.body.algorithm as KeyAlgorithm) ?? KeyAlgorithm.EC_P384;
    const result = await generateKeyPairAsync(algorithm);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function generateKeyPairWithIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const algorithm = (req.body.algorithm as KeyAlgorithm) ?? KeyAlgorithm.EC_P384;
    const result = await generateKeyPairWithIdAsync(algorithm);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function signCertificateHandler(req: Request, res: Response): Promise<void> {
  try {
    const options = req.body as unknown as SignOptions;
    const result = await signCertificateAsync(options);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function createCsrHandler(req: Request, res: Response): Promise<void> {
  try {
    const options = req.body as unknown as CsrOptions;
    const result = await createCsrAsync(options);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function validateCertificateHandler(req: Request, res: Response): Promise<void> {
  try {
    const certPem = req.body.certPem as string;
    const result = await validateCertificateAsync(certPem);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function parseKeyHandler(req: Request, res: Response): Promise<void> {
  try {
    const privateKey = req.body.privateKey as string;
    const result = await parseKeyAsync(privateKey);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

export async function signHandler(req: Request, res: Response): Promise<void> {
  try {
    const { algorithm, body, privateKey } = req.body as { algorithm: string; body: string; privateKey: string };
    const result = await signAsync(algorithm, body, privateKey);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}
