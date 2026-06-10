import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { env } from '../config/env';
import { CertificateAuthority } from '../core/ca';
import { Rotator } from '../core/rotator';
import { CaStore } from '../persistence/ca-store';
import { CertificateStore } from '../persistence/certificate-store';
import { CrlStore } from '../persistence/crl-store';

let ca: CertificateAuthority;
let rotator: Rotator;
let certificateStore: CertificateStore;
let crlStore: CrlStore;
let caStore: CaStore;

createBootstrap({
  name: 'CertificateAuthority',
  createServer,
  onStart: async () => {
    certificateStore = new CertificateStore(env.MONGODB_URI);
    crlStore = new CrlStore(env.MONGODB_URI);
    caStore = new CaStore(env.MONGODB_URI);

    await certificateStore.connect();
    await crlStore.connect();
    await caStore.connect();

    ca = new CertificateAuthority({
      caKeyPath: env.CA_KEY_PATH,
      caCertTtlMs: env.CA_CERT_TTL_MS,
      certificateStore,
      crlStore,
      caStore,
    });
    await ca.initialize();

    rotator = new Rotator({
      ca,
      certificateStore,
      intervalMs: env.CERT_ROTATION_INTERVAL_MS,
      marginMs: env.CERT_ROTATION_MARGIN_MS,
      defaultTtlMs: env.CERT_DEFAULT_TTL_MS,
    });
    rotator.start();
  },
  onStop: async () => {
    rotator?.stop();
    await certificateStore?.disconnect();
    await crlStore?.disconnect();
    await caStore?.disconnect();
  },
});

export { ca, certificateStore, crlStore, caStore };
