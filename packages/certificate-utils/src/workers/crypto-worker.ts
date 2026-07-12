import { JobType } from "@trading-model/common/domain/primitives";
import {
	BaseWorker,
	type BaseWorkerConfig,
} from "@trading-model/common/worker/base-worker";
import { parseKey, sign } from "../format/sign";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
	type KeyAlgorithm,
} from "../keygen/generate-key-pair";
import type { KeyPair, KeyPairWithId, SignInput } from "../keygen/types";
import { type CsrOptions, createCsr } from "../signing/create-csr";
import { type SignOptions, signCertificate } from "../signing/sign-certificate";
import { validateCertificate } from "../validation/validate-certificate";

const HANDLERS: [JobType, (job: { payload: unknown }) => Promise<unknown>][] = [
	[
		JobType.of("generateKeyPair"),
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPair(
					(job.payload as { algorithm: KeyAlgorithm }).algorithm
				) as KeyPair
			),
	],
	[
		JobType.of("generateKeyPairWithId"),
		(job: { payload: unknown }) =>
			Promise.resolve(
				generateKeyPairWithIdSync(
					(job.payload as { algorithm: KeyAlgorithm }).algorithm
				) as KeyPairWithId
			),
	],
	[
		JobType.of("signCertificate"),
		(job: { payload: unknown }) =>
			Promise.resolve(signCertificate(job.payload as SignOptions)),
	],
	[
		JobType.of("createCsr"),
		(job: { payload: unknown }) =>
			Promise.resolve(createCsr(job.payload as CsrOptions)),
	],
	[
		JobType.of("validateCertificate"),
		(job: { payload: unknown }) =>
			Promise.resolve(
				validateCertificate({
					certPem: (job.payload as { certPem: string }).certPem,
					caCertPem: (job.payload as { caCertPem?: string }).caCertPem ?? "",
				})
			),
	],
	[
		JobType.of("parseKey"),
		(job: { payload: unknown }) =>
			Promise.resolve(
				parseKey((job.payload as { privateKey: string }).privateKey)
			),
	],
	[
		JobType.of("sign"),
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
