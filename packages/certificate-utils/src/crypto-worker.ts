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

export function createCryptoWorker(config: BaseWorkerConfig): BaseWorker {
	const worker = new BaseWorker(config);

	worker.registerHandler<{ algorithm: KeyAlgorithm }>(
		"generateKeyPair",
		(job) => {
			const result: KeyPair = generateKeyPair(job.payload.algorithm);
			return Promise.resolve(result);
		}
	);

	worker.registerHandler<{ algorithm: KeyAlgorithm }>(
		"generateKeyPairWithId",
		(job) => {
			const result: KeyPairWithId = generateKeyPairWithIdSync(
				job.payload.algorithm
			);
			return Promise.resolve(result);
		}
	);

	worker.registerHandler<SignOptions>("signCertificate", (job) => {
		const result = signCertificate(job.payload);
		return Promise.resolve(result);
	});

	worker.registerHandler<CsrOptions>("createCsr", (job) => {
		const result = createCsr(job.payload);
		return Promise.resolve(result);
	});

	worker.registerHandler<{ certPem: string; caCertPem?: string }>(
		"validateCertificate",
		(job) => {
			const result = validateCertificate(
				job.payload.certPem,
				job.payload.caCertPem ?? ""
			);
			return Promise.resolve(result);
		}
	);

	worker.registerHandler<{ privateKey: string }>("parseKey", (job) => {
		const result = parseKey(job.payload.privateKey);
		return Promise.resolve(result);
	});

	worker.registerHandler<{
		algorithm: string;
		body: string;
		privateKey: string;
	}>("sign", (job) => {
		const result = sign(
			job.payload.algorithm,
			job.payload.body,
			job.payload.privateKey
		);
		return Promise.resolve(result);
	});

	return worker;
}
