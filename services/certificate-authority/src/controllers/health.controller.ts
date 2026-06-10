import { createHash } from 'node:crypto';

import { Request, Response } from 'express';

import { ca } from '../app/index';

export async function ping(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ status: 'ok' });
}

export async function health(_req: Request, res: Response): Promise<void> {
  const isReady = ca.isInitialized();

  if (!isReady) {
    res.status(503).json({
      status: 'unavailable',
      caInitialized: false,
    });
    return;
  }

  res.status(200).json({
    status: 'ok',
    caInitialized: true,
    caFingerprint: ca.getCaCertPem()
      ? createHash('sha256').update(ca.getCaCertPem()).digest('hex')
      : null,
  });
}
