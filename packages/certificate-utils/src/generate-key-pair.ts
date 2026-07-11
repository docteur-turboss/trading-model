import {
	generateKeyPairSync as nodeGenerateKeyPairSync,
	randomUUID,
} from "node:crypto";
import { KeyId, KeyPem } from "@trading-model/common/domain/primitives";
import {
	getAlgorithmOptions,
	getKeyEncoding,
	KeyAlgorithm,
} from "./key-algorithm";
import type { KeyPair, KeyPairWithId } from "./types";

export type { KeyPair, KeyPairWithId } from "./types";

export { KeyAlgorithm };

export function generateKeyPair(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): KeyPair {
	const algorithmOptions = getAlgorithmOptions(algorithm);
	const { publicKey, privateKey } = (
		nodeGenerateKeyPairSync as (
			type: string,
			options: Record<string, unknown>
		) => { publicKey: unknown; privateKey: unknown }
	)(algorithm, {
		...algorithmOptions,
		...getKeyEncoding(),
	});
	return {
		publicKey: KeyPem.of(publicKey as string),
		privateKey: KeyPem.of(privateKey as string),
	};
}

export function generateKeyPairSync(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): KeyPair {
	return generateKeyPair(algorithm);
}

export function generateKeyPairWithId(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): KeyPairWithId {
	const pair = generateKeyPair(algorithm);
	return { ...pair, id: KeyId.of(randomUUID()) };
}

export function generateKeyPairWithIdSync(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): KeyPairWithId {
	return generateKeyPairWithId(algorithm);
}
