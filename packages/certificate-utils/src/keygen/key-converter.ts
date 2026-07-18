import { createPrivateKey, createPublicKey } from "node:crypto";
import forge from "node-forge";
import { KeyAlgorithm } from "./key-algorithm";

export function resolvePublicKey(
	issuerCert: string
): ReturnType<typeof createPublicKey> {
	return createPublicKey(issuerCert);
}

export function privateKeyFromPem(pem: string): forge.pki.PrivateKey {
	const keyObject = createPrivateKey(pem);
	const keyType = keyObject.asymmetricKeyType;
	if (keyType === KeyAlgorithm.EcP384) {
		const sec1 = keyObject.export({ type: "sec1", format: "pem" });
		return forge.pki.privateKeyFromPem(sec1);
	}
	const pkcs1 = keyObject.export({ type: "pkcs1", format: "pem" });
	return forge.pki.privateKeyFromPem(pkcs1);
}
