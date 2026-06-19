import { BaseWorker, BaseWorkerConfig } from '@trading-model/common/worker/base-worker';

import { createCsr, CsrOptions } from './create-csr';
import { generateKeyPair, KeyAlgorithm, generateKeyPairWithIdSync } from './generate-key-pair';
import { parseKey, sign } from './sign';
import { signCertificate, SignOptions } from './sign-certificate';
import { KeyPair, KeyPairWithId } from './types';
import { validateCertificate } from './validate-certificate';

export function createCryptoWorker(config: BaseWorkerConfig): BaseWorker {
  const worker = new BaseWorker(config);

  worker.registerHandler<{ algorithm: KeyAlgorithm }>('generateKeyPair', async job => {
    const result: KeyPair = generateKeyPair(job.payload.algorithm);
    return result;
  });

  worker.registerHandler<{ algorithm: KeyAlgorithm }>('generateKeyPairWithId', async job => {
    const result: KeyPairWithId = generateKeyPairWithIdSync(job.payload.algorithm);
    return result;
  });

  worker.registerHandler<SignOptions>('signCertificate', async job => {
    const result = signCertificate(job.payload);
    return result;
  });

  worker.registerHandler<CsrOptions>('createCsr', async job => {
    const result = createCsr(job.payload);
    return result;
  });

  worker.registerHandler<{ certPem: string; caCertPem?: string }>('validateCertificate', async job => {
    const result = validateCertificate(job.payload.certPem, job.payload.caCertPem ?? '');
    return result;
  });

  worker.registerHandler<{ privateKey: string }>('parseKey', async job => {
    const result = parseKey(job.payload.privateKey);
    return result;
  });

  worker.registerHandler<{ algorithm: string; body: string; privateKey: string }>('sign', async job => {
    const result = sign(job.payload.algorithm, job.payload.body, job.payload.privateKey);
    return result;
  });

  return worker;
}
