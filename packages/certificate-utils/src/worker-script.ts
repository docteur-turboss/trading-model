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

PP.on("message", (task: WorkerTask) => {
	try {
		let result: unknown;

		switch (task.type) {
			case "generateKeyPair": {
				result = generateKeyPair(
					task.data
						.algorithm as unknown as import("./generate-key-pair").KeyAlgorithm
				);
				break;
			}

			case "generateKeyPairWithId": {
				result = generateKeyPairWithIdSync(
					task.data
						.algorithm as unknown as import("./generate-key-pair").KeyAlgorithm
				);
				break;
			}

			case "signCertificate": {
				result = signCertificate(task.data as unknown as SignOptions);
				break;
			}

			case "createCsr": {
				result = createCsr(task.data as unknown as CsrOptions);
				break;
			}

			case "validateCertificate": {
				const { certPem, caCertPem } = task.data as {
					certPem: string;
					caCertPem?: string;
				};
				result = validateCertificate(certPem, caCertPem ?? "");
				break;
			}

			case "parseKey": {
				const { privateKey } = task.data as { privateKey: string };
				const publicKey = createPublicKey(privateKey).export({
					type: "spki",
					format: "pem",
				});
				result = { publicKey, privateKey };
				break;
			}

			case "sign": {
				const { algorithm, body, privateKey } = task.data as {
					algorithm: string;
					body: string;
					privateKey: string;
				};
				const sign = createSign(algorithm);
				sign.update(body);
				result = sign.sign(privateKey, "base64");
				break;
			}

			default:
				throw new Error(`Unknown task type: ${task.type}`);
		}

		PP.postMessage({ id: task.id, success: true, data: result });
	} catch (err) {
		PP.postMessage({
			id: task.id,
			success: false,
			error: (err as Error).message,
		});
	}
});
