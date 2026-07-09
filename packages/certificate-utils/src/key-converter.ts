import { createPrivateKey, createPublicKey } from "node:crypto";
import forge from "node-forge";

export class KeyConverter {
	resolvePublicKey(issuerCert: string): ReturnType<typeof createPublicKey> {
		return createPublicKey(issuerCert);
	}

	privateKeyFromPem(pem: string): forge.pki.PrivateKey {
		const keyObject = createPrivateKey(pem);
		const keyType = keyObject.asymmetricKeyType;
		if (keyType === "ec") {
			const sec1 = keyObject.export({ type: "sec1", format: "pem" });
			return forge.pki.privateKeyFromPem(sec1);
		}
		const pkcs1 = keyObject.export({ type: "pkcs1", format: "pem" });
		return forge.pki.privateKeyFromPem(pkcs1);
	}
}
