import { createPublicKey, createVerify, X509Certificate } from "node:crypto";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

export interface PopVerificationInput {
	certPem: string;
	nonce: string;
	signature: string;
}

export function verifyProofOfPossession(input: PopVerificationInput): boolean {
	const { certPem, nonce, signature } = input;
	try {
		const cert = new X509Certificate(certPem);
		const publicKey = createPublicKey(cert.publicKey);
		const verify = createVerify(CryptoAlg.SHA256);
		verify.update(Buffer.from(nonce, CryptoAlg.UTF8));
		const sigBuffer = Buffer.from(signature, "base64");
		return verify.verify(publicKey, sigBuffer);
	} catch {
		return false;
	}
}
