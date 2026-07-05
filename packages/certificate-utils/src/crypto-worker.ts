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
import type { KeyPair, KeyPairWithId } from "./types";
import { validateCertificate } from "./validate-certificate";

type JobHandler<TPayload> = (job: { payload: TPayload }) => Promise<unknown>;

const HANDLERS: [string, JobHandler<unknown>][] = [
	[
		"generateKeyPair",
		(job: { payload: { algorithm: KeyAlgorithm } }) =>
			Promise.resolve(generateKeyPair(job.payload.algorithm) as KeyPair),
	],
	[
		"generateKeyPairWithId",
		(job: { payload: { algorithm: KeyAlgorithm } }) =>
			Promise.resolve(
				generateKeyPairWithIdSync(job.payload.algorithm) as KeyPairWithId
			),
	],
	[
		"signCertificate",
		(job: { payload: SignOptions }) =>
			Promise.resolve(signCertificate(job.payload)),
	],
	[
		"createCsr",
		(job: { payload: CsrOptions }) => Promise.resolve(createCsr(job.payload)),
	],
	[
		"validateCertificate",
		(job: { payload: { certPem: string; caCertPem?: string } }) =>
			Promise.resolve(
				validateCertificate(job.payload.certPem, job.payload.caCertPem ?? "")
			),
	],
	[
		"parseKey",
		(job: { payload: { privateKey: string } }) =>
			Promise.resolve(parseKey(job.payload.privateKey)),
	],
	[
		"sign",
		(job: {
			payload: { algorithm: string; body: string; privateKey: string };
		}) =>
			Promise.resolve(
				sign(job.payload.algorithm, job.payload.body, job.payload.privateKey)
			),
	],
];

export function createCryptoWorker(config: BaseWorkerConfig): BaseWorker {
	const worker = new BaseWorker(config);
	for (const [name, handler] of HANDLERS) {
		worker.registerHandler(name, handler);
	}
	return worker;
}
