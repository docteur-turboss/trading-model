/**
 * VaultSigningProvider — adapts VaultTransitClient to the SigningProvider interface.
 *
 * Delegates all signing operations to HashiCorp Vault Transit,
 * so the CA private key never leaves Vault's HSM boundary.
 */
import { SigningProvider } from './signing-provider';
import { VaultTransitClient } from './vault-transit-client';

export class VaultSigningProvider implements SigningProvider {
  private readonly vault: VaultTransitClient;
  private readonly keyName: string;
  private publicKeyPem: string | null = null;

  constructor(vault: VaultTransitClient, keyName: string) {
    this.vault = vault;
    this.keyName = keyName;
  }

  async getPublicKey(): Promise<string> {
    if (!this.publicKeyPem) {
      this.publicKeyPem = await this.vault.readPublicKey(this.keyName);
    }
    return this.publicKeyPem;
  }

  async sign(tbsDerBytes: Buffer): Promise<Buffer> {
    const derBinary = tbsDerBytes.toString('binary');
    const signatureBinary = await this.vault.signBytes(this.keyName, derBinary);
    return Buffer.from(signatureBinary, 'binary');
  }

  isRemote(): boolean {
    return true;
  }

  destroy(): void {
    this.vault.destroy();
  }
}
