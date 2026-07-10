import { createPublicKey, createVerify, X509Certificate } from "node:crypto";
import { CRYPTO } from "@trading-model/common/crypto/crypto-constants";

export interface PopVerificationInput {
	certPem: string;
	nonce: string;
	signature: string;
}

/**
 * Proof-of-possession (POP) verification.
 * Verifies a client holds the private key corresponding to a certificate's public key,
 * without the client ever revealing that key.
 */
export class PopVerifier {
	/**
	 * Verify a signature was produced by the holder of the certificate's private key.
	 */
	verify(input: PopVerificationInput): boolean {
		const { certPem, nonce, signature } = input;
		try {
			const cert = new X509Certificate(certPem);
			const publicKey = createPublicKey(cert.publicKey);
			const verify = createVerify(CRYPTO.SHA256);
			verify.update(Buffer.from(nonce, CRYPTO.UTF8));
			const sigBuffer = Buffer.from(signature, "base64");
			return verify.verify(publicKey, sigBuffer);
		} catch {
			return false;
		}
	}
}
