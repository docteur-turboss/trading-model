import { SignedCertificate } from '@trading-model/certificate-utils/types';
import { validateCertificate } from '@trading-model/certificate-utils/validate-certificate';

import { CertificateAuthority } from './ca';
import { CertificateStore } from '../persistence/certificate-store';
import { CrlStore } from '../persistence/crl-store';

export interface DistributorOptions {
  ca: CertificateAuthority;
  certificateStore: CertificateStore;
  crlStore: CrlStore;
}

export class Distributor {
  private readonly options: DistributorOptions;

  constructor(options: DistributorOptions) {
    this.options = options;
  }

  async getCertificate(serviceId: string): Promise<SignedCertificate | null> {
    const cert = await this.options.certificateStore.getByServiceId(serviceId);
    if (!cert) {
      return null;
    }

    const validation = validateCertificate(cert.certPem, this.options.ca.getCaCertPem());
    if (!validation.valid) {
      return null;
    }

    return cert;
  }

  async requestCertificate(
    serviceId: string,
    csr: string,
    _bootstrapToken?: string
  ): Promise<SignedCertificate> {
    const cert = await this.options.ca.signServiceCertificate(serviceId, csr);
    return cert;
  }
}
