import {
	generateKeyPairSync as nodeGenerateKeyPairSync,
	randomUUID,
} from "node:crypto";

import type { KeyPair, KeyPairWithId } from "./types";

export const KeyAlgorithm = {
	rsa4096: "rsa",
	ecP384: "ec",
} as const;

export type KeyAlgorithm = (typeof KeyAlgorithm)[keyof typeof KeyAlgorithm];

export function generateKeyPair(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): KeyPair {
	const algorithmOptions: Record<string, unknown> =
		algorithm === KeyAlgorithm.rsa4096
			? { modulusLength: 4096 }
			: { namedCurve: "P-384" };

	const { publicKey, privateKey } = (
		nodeGenerateKeyPairSync as (
			type: string,
			options: Record<string, unknown>
		) => { publicKey: unknown; privateKey: unknown }
	)(algorithm, {
		...algorithmOptions,
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});

	return {
		publicKey: publicKey as string,
		privateKey: privateKey as string,
	};
}

export function generateKeyPairSync(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): KeyPair {
	return generateKeyPair(algorithm);
}

export function generateKeyPairWithId(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): KeyPairWithId {
	const pair = generateKeyPair(algorithm);
	return { ...pair, id: randomUUID() };
}

export function generateKeyPairWithIdSync(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): KeyPairWithId {
	return generateKeyPairWithId(algorithm);
}
