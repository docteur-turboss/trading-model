import {
	generateKeyPairSync as nodeGenerateKeyPairSync,
	randomUUID,
} from "node:crypto";

import type { KeyPair, KeyPairWithId } from "./types";

export type { KeyPair, KeyPairWithId } from "./types";

export const KeyAlgorithm = {
	rsa4096: "rsa",
	ecP384: "ec",
} as const;

export type KeyAlgorithm = (typeof KeyAlgorithm)[keyof typeof KeyAlgorithm];

function _getAlgorithmOptions(
	algorithm: KeyAlgorithm
): Record<string, unknown> {
	return algorithm === KeyAlgorithm.rsa4096
		? { modulusLength: 4096 }
		: { namedCurve: "P-384" };
}

function _getKeyEncoding() {
	return {
		publicKeyEncoding: { type: "spki" as const, format: "pem" as const },
		privateKeyEncoding: { type: "pkcs8" as const, format: "pem" as const },
	};
}

export function generateKeyPair(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): KeyPair {
	const algorithmOptions = _getAlgorithmOptions(algorithm);
	const { publicKey, privateKey } = (
		nodeGenerateKeyPairSync as (
			type: string,
			options: Record<string, unknown>
		) => { publicKey: unknown; privateKey: unknown }
	)(algorithm, {
		...algorithmOptions,
		..._getKeyEncoding(),
	});
	return { publicKey: publicKey as string, privateKey: privateKey as string };
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
