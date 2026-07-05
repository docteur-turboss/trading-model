import { createPublicKey, createSign } from "node:crypto";
import { parentPort } from "node:worker_threads";

import { type CsrOptions, createCsr } from "./create-csr";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
} from "./generate-key-pair";
import { type SignOptions, signCertificate } from "./sign-certificate";
import { validateCertificate } from "./validate-certificate";

interface WorkerTask {
	id: string;
	type:
		| "generateKeyPair"
		| "generateKeyPairWithId"
		| "signCertificate"
		| "createCsr"
		| "validateCertificate"
		| "parseKey"
		| "sign";
	data: Record<string, unknown>;
}

if (!parentPort) {
	throw new Error("worker-script must be run as a worker thread");
}

const PP = parentPort;

function _handleGenerateKeyPair(data: Record<string, unknown>): unknown {
	return generateKeyPair(
		data.algorithm as unknown as import("./generate-key-pair").KeyAlgorithm
	);
}

function _handleGenerateKeyPairWithId(data: Record<string, unknown>): unknown {
	return generateKeyPairWithIdSync(
		data.algorithm as unknown as import("./generate-key-pair").KeyAlgorithm
	);
}

function _handleSignCertificate(data: Record<string, unknown>): unknown {
	return signCertificate(data as unknown as SignOptions);
}

function _handleCreateCsr(data: Record<string, unknown>): unknown {
	return createCsr(data as unknown as CsrOptions);
}

function _handleValidateCertificate(data: Record<string, unknown>): unknown {
	const { certPem, caCertPem } = data as {
		certPem: string;
		caCertPem?: string;
	};
	return validateCertificate(certPem, caCertPem ?? "");
}

function _handleParseKey(data: Record<string, unknown>): unknown {
	const { privateKey } = data as { privateKey: string };
	const publicKey = createPublicKey(privateKey).export({
		type: "spki",
		format: "pem",
	});
	return { publicKey, privateKey };
}

function _handleSign(data: Record<string, unknown>): unknown {
	const { algorithm, body, privateKey } = data as {
		algorithm: string;
		body: string;
		privateKey: string;
	};
	const sign = createSign(algorithm);
	sign.update(body);
	return sign.sign(privateKey, "base64");
}

const HANDLERS: Partial<Record<WorkerTask["type"], (data: Record<string, unknown>) => unknown>> = {
	generateKeyPair: _handleGenerateKeyPair,
	generateKeyPairWithId: _handleGenerateKeyPairWithId,
	signCertificate: _handleSignCertificate,
	createCsr: _handleCreateCsr,
	validateCertificate: _handleValidateCertificate,
	parseKey: _handleParseKey,
	sign: _handleSign,
};

PP.on("message", (task: WorkerTask) => {
	try {
		const handler = HANDLERS[task.type];
		if (!handler) {
			throw new Error(`Unknown task type: ${task.type}`);
		}
		const result = handler(task.data);
		PP.postMessage({ id: task.id, success: true, data: result });
	} catch (err) {
		PP.postMessage({
			id: task.id,
			success: false,
			error: (err as Error).message,
		});
	}
});
