import { createPublicKey, createSign } from "node:crypto";
import { parentPort } from "node:worker_threads";

import { type CsrOptions, createCsr } from "./create-csr";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
	type KeyAlgorithm,
} from "./generate-key-pair";
import { type SignOptions, signCertificate } from "./sign-certificate";
import type { SignInput } from "./types";
import { validateCertificate } from "./validate-certificate";
import { WorkerTaskType } from "./worker-task-type";

interface GenerateKeyPairTask {
	id: string;
	type: WorkerTaskType.GenerateKeyPair;
	data: { algorithm: KeyAlgorithm };
}

interface GenerateKeyPairWithIdTask {
	id: string;
	type: WorkerTaskType.GenerateKeyPairWithId;
	data: { algorithm: KeyAlgorithm };
}

interface SignCertificateTask {
	id: string;
	type: WorkerTaskType.SignCertificate;
	data: SignOptions;
}

interface CreateCsrTask {
	id: string;
	type: WorkerTaskType.CreateCsr;
	data: CsrOptions;
}

interface ValidateCertificateTask {
	id: string;
	type: WorkerTaskType.ValidateCertificate;
	data: { certPem: string; caCertPem?: string };
}

interface ParseKeyTask {
	id: string;
	type: WorkerTaskType.ParseKey;
	data: { privateKey: string };
}

interface SignTask {
	id: string;
	type: WorkerTaskType.Sign;
	data: SignInput;
}

type WorkerTask =
	| GenerateKeyPairTask
	| GenerateKeyPairWithIdTask
	| SignCertificateTask
	| CreateCsrTask
	| ValidateCertificateTask
	| ParseKeyTask
	| SignTask;

if (!parentPort) {
	throw new Error("worker-script must be run as a worker thread");
}

const PP = parentPort;

function _handleTask(task: WorkerTask): void {
	switch (task.type) {
		case WorkerTaskType.GenerateKeyPair: {
			const result = generateKeyPair(task.data.algorithm);
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		case WorkerTaskType.GenerateKeyPairWithId: {
			const result = generateKeyPairWithIdSync(task.data.algorithm);
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		case WorkerTaskType.SignCertificate: {
			const result = signCertificate(task.data);
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		case WorkerTaskType.CreateCsr: {
			const result = createCsr(task.data);
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		case WorkerTaskType.ValidateCertificate: {
			const result = validateCertificate({
				certPem: task.data.certPem,
				caCertPem: task.data.caCertPem ?? "",
			});
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		case WorkerTaskType.ParseKey: {
			const publicKey = createPublicKey(task.data.privateKey).export({
				type: "spki",
				format: "pem",
			});
			PP.postMessage({
				id: task.id,
				success: true,
				data: { publicKey, privateKey: task.data.privateKey },
			});
			return;
		}
		case WorkerTaskType.Sign: {
			const sign = createSign(task.data.algorithm);
			sign.update(task.data.body);
			const result = sign.sign(task.data.privateKey, "base64");
			PP.postMessage({ id: task.id, success: true, data: result });
			return;
		}
		default:
			PP.postMessage({
				id: (task as WorkerTask).id,
				success: false,
				error: `Unknown task type: ${(task as WorkerTask).type}`,
			});
	}
}

PP.on("message", (task: WorkerTask) => {
	try {
		_handleTask(task);
	} catch (err) {
		PP.postMessage({
			id: task.id,
			success: false,
			error: (err as Error).message,
		});
	}
});
