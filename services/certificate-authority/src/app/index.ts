import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { container } from './container';
import { createServer } from './server';
import { env } from '../config/env';
import { CertificateAuthority } from '../core/ca';
import { Rotator } from '../core/rotator';
import { CaStore } from '../persistence/ca-store';
import { CertificateStore } from '../persistence/certificate-store';
import { CrlStore } from '../persistence/crl-store';

createBootstrap({
  name: 'CertificateAuthority',
  createServer,
  onStart: async () => {
    container.certificateStore = new CertificateStore(env.MONGODB_URI);
    container.crlStore = new CrlStore(env.MONGODB_URI);
    container.caStore = new CaStore(env.MONGODB_URI);

    await container.certificateStore.connect();
    await container.crlStore.connect();
    await container.caStore.connect();

    container.ca = new CertificateAuthority({
      caKeyPath: env.CA_KEY_PATH,
      caCertTtlMs: env.CA_CERT_TTL_MS,
      certificateStore: container.certificateStore,
      crlStore: container.crlStore,
      caStore: container.caStore,
    });
    await container.ca.initialize();

    const rotator = new Rotator({
      ca: container.ca,
      certificateStore: container.certificateStore,
      intervalMs: env.CERT_ROTATION_INTERVAL_MS,
      marginMs: env.CERT_ROTATION_MARGIN_MS,
      defaultTtlMs: env.CERT_DEFAULT_TTL_MS,
    });
    rotator.start();
  },
  onStop: async () => {
    await container.certificateStore?.disconnect();
    await container.crlStore?.disconnect();
    await container.caStore?.disconnect();
  },
});

export { container };
