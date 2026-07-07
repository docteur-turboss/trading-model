import {
	BaseWorker,
	type BaseWorkerConfig,
} from "@trading-model/common/worker/base-worker";

import { type CsrOptions, createCsr } from "./create-csr";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
	type KeyAlgorithm,
} from "./generate-key-pair";
import { parseKey, sign } from "./sign";
import { type SignOptions, signCertificate } from "./sign-certificate";
import type { KeyPair, KeyPairWithId, SignInput } from "./types";
import { validateCertificate } from "./validate-certificate";

const HANDLERS: [string, (job: { payload: unknown }) => Promise<unknown>][] = [
	[
		"generateKeyPair",
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPair((job.payload as { algorithm: KeyAlgorithm }).algorithm) as KeyPair
			),
	],
	[
		"generateKeyPairWithId",
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPairWithIdSync(
					(job.payload as { algorithm: KeyAlgorithm }).algorithm
				) as KeyPairWithId
			),
	],
	[
		"signCertificate",
		(job: { payload: unknown }) =>
			Promise.resolve(signCertificate(job.payload as SignOptions)),
	],
	[
		"createCsr",
		(job: { payload: unknown }) =>
			Promise.resolve(createCsr(job.payload as CsrOptions)),
	],
	[
		"validateCertificate",
		(job: { payload: unknown }) =>
			Promise.resolve(
				validateCertificate({
					certPem: (job.payload as { certPem: string }).certPem,
					caCertPem: (job.payload as { caCertPem?: string }).caCertPem ?? "",
				})
			),
	],
	[
		"parseKey",
		(job: { payload: unknown }) =>
			Promise.resolve(parseKey((job.payload as { privateKey: string }).privateKey)),
	],
	[
		"sign",
		(job: { payload: unknown }) =>
			Promise.resolve(sign(job.payload as SignInput)),
	],
];

export function createCryptoWorker(config: BaseWorkerConfig): BaseWorker {
	const worker = new BaseWorker(config);
	for (const [name, handler] of HANDLERS) {
		worker.registerHandler(name, handler);
	}
	return worker;
}
