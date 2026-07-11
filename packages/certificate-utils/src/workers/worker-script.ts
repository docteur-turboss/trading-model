import { createPublicKey, createSign } from "node:crypto";
import { parentPort } from "node:worker_threads";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
	type KeyAlgorithm,
} from "../keygen/generate-key-pair";
import { type SignOptions, signCertificate } from "../sign-certificate";
import { type CsrOptions, createCsr } from "../signing/create-csr";
import type { SignInput } from "../types";
import { validateCertificate } from "../validation/validate-certificate";
import { WorkerTaskType } from "../worker-task-type";

interface BaseTask {
	id: string;
}

interface GenerateKeyPairTask extends BaseTask {
	type: WorkerTaskType.GenerateKeyPair;
	data: { algorithm: KeyAlgorithm };
}

interface GenerateKeyPairWithIdTask extends BaseTask {
	type: WorkerTaskType.GenerateKeyPairWithId;
	data: { algorithm: KeyAlgorithm };
}

interface SignCertificateTask extends BaseTask {
	type: WorkerTaskType.SignCertificate;
	data: SignOptions;
}

interface CreateCsrTask extends BaseTask {
	type: WorkerTaskType.CreateCsr;
	data: CsrOptions;
}

interface ValidateCertificateTask extends BaseTask {
	type: WorkerTaskType.ValidateCertificate;
	data: { certPem: string; caCertPem?: string };
}

interface ParseKeyTask extends BaseTask {
	type: WorkerTaskType.ParseKey;
	data: { privateKey: string };
}

interface SignTask extends BaseTask {
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

type TaskHandler = (task: WorkerTask & { id: string }) => void;

const HANDLERS: Partial<Record<WorkerTaskType, TaskHandler>> = {
	[WorkerTaskType.GenerateKeyPair]: (task) => {
		const typedTask = task as GenerateKeyPairTask;
		const result = generateKeyPair(typedTask.data.algorithm);
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
	[WorkerTaskType.GenerateKeyPairWithId]: (task) => {
		const typedTask = task as GenerateKeyPairWithIdTask;
		const result = generateKeyPairWithIdSync(typedTask.data.algorithm);
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
	[WorkerTaskType.SignCertificate]: (task) => {
		const typedTask = task as SignCertificateTask;
		const result = signCertificate(typedTask.data);
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
	[WorkerTaskType.CreateCsr]: (task) => {
		const typedTask = task as CreateCsrTask;
		const result = createCsr(typedTask.data);
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
	[WorkerTaskType.ValidateCertificate]: (task) => {
		const typedTask = task as ValidateCertificateTask;
		const result = validateCertificate({
			certPem: typedTask.data.certPem,
			caCertPem: typedTask.data.caCertPem ?? "",
		});
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
	[WorkerTaskType.ParseKey]: (task) => {
		const typedTask = task as ParseKeyTask;
		const publicKey = createPublicKey(typedTask.data.privateKey).export({
			type: "spki",
			format: "pem",
		});
		PP.postMessage({
			id: typedTask.id,
			success: true,
			data: { publicKey, privateKey: typedTask.data.privateKey },
		});
	},
	[WorkerTaskType.Sign]: (task) => {
		const typedTask = task as SignTask;
		const sign = createSign(typedTask.data.algorithm);
		sign.update(typedTask.data.body);
		const result = sign.sign(typedTask.data.privateKey, "base64");
		PP.postMessage({ id: typedTask.id, success: true, data: result });
	},
};

PP.on("message", (task: WorkerTask) => {
	try {
		const handler = HANDLERS[task.type];
		if (handler) {
			handler(task);
		} else {
			PP.postMessage({
				id: task.id,
				success: false,
				error: `Unknown task type: ${task.type}`,
			});
		}
	} catch (err) {
		PP.postMessage({
			id: task.id,
			success: false,
			error: (err as Error).message,
		});
	}
});
