import { type JobType } from "@trading-model/common/domain/primitives";
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

const HANDLERS: [JobType, (job: { payload: unknown }) => Promise<unknown>][] = [
	[
		"generateKeyPair" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPair(
					(job.payload as { algorithm: KeyAlgorithm }).algorithm
				) as KeyPair
			),
	],
	[
		"generateKeyPairWithId" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPairWithIdSync(
					(job.payload as { algorithm: KeyAlgorithm }).algorithm
				) as KeyPairWithId
			),
	],
	[
		"signCertificate" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(signCertificate(job.payload as SignOptions)),
	],
	[
		"createCsr" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(createCsr(job.payload as CsrOptions)),
	],
	[
		"validateCertificate" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(
				validateCertificate({
					certPem: (job.payload as { certPem: string }).certPem,
					caCertPem: (job.payload as { caCertPem?: string }).caCertPem ?? "",
				})
			),
	],
	[
		"parseKey" as JobType,
		(job: { payload: unknown }) =>
			Promise.resolve(
				parseKey((job.payload as { privateKey: string }).privateKey)
			),
	],
	[
		"sign" as JobType,
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
