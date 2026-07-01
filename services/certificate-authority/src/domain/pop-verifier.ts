import { createPublicKey, createVerify, X509Certificate } from 'node:crypto';

/**
 * Proof-of-possession (POP) verification.
 * Verifies a client holds the private key corresponding to a certificate's public key,
 * without the client ever revealing that key.
 */
export class PopVerifier {
  /**
   * Verify a signature was produced by the holder of the certificate's private key.
   * @param certPem — PEM-encoded X.509 certificate containing the public key
   * @param nonce — The challenge nonce that was signed
   * @param signature — Base64-encoded signature over the nonce
   * @returns true if the signature is valid, false otherwise
   */
  verify(certPem: string, nonce: string, signature: string): boolean {
    try {
      const cert = new X509Certificate(certPem);
      const publicKey = createPublicKey(cert.publicKey);
      const verify = createVerify('sha256');
      verify.update(Buffer.from(nonce, 'utf8'));
      const sigBuffer = Buffer.from(signature, 'base64');
      return verify.verify(publicKey, sigBuffer);
    } catch {
      return false;
    }
  }
}
