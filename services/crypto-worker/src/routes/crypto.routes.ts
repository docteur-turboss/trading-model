import { Router } from 'express';

import {
  generateKeyPairHandler,
  generateKeyPairWithIdHandler,
  signCertificateHandler,
  createCsrHandler,
  validateCertificateHandler,
  parseKeyHandler,
  signHandler,
} from '../controllers/crypto.controller';

const router = Router();

router.post('/generate-key-pair', generateKeyPairHandler);
router.post('/generate-key-pair-with-id', generateKeyPairWithIdHandler);
router.post('/sign-certificate', signCertificateHandler);
router.post('/create-csr', createCsrHandler);
router.post('/validate-certificate', validateCertificateHandler);
router.post('/parse-key', parseKeyHandler);
router.post('/sign', signHandler);

export function cryptoRoutes(): Router {
  return router;
}
