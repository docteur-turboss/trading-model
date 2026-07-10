import type { CsrOptions } from "./create-csr";
import { KeyAlgorithm } from "./generate-key-pair";
import type { SignOptions } from "./sign-certificate";
import type { RemoteSigningClient } from "./signing/remote-signing-client";
import type {
	KeyPair,
	KeyPairWithId,
	SignedCertificate,
	SignInput,
} from "./types";
import type {
	CertificateValidationInput,
	ValidationResult,
} from "./validate-certificate";
import type { TaskType } from "./workers/worker-task-queue";
import { getPool } from "./workers/lazy-pool";

let remoteClient: RemoteSigningClient | null = null;

export function setRemoteSigningClient(
	client: RemoteSigningClient | null
): void {
	remoteClient = client;
}

export async function generateKeyPairAsync(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): Promise<KeyPair> {
	if (remoteClient) {
		return await remoteClient.generateKeyPair(algorithm);
	}
	return await getPool().execute<KeyPair>("generateKeyPair" as TaskType, { algorithm });
}

export async function generateKeyPairWithIdAsync(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): Promise<KeyPairWithId> {
	if (remoteClient) {
		return await remoteClient.generateKeyPairWithId(algorithm);
	}
	return await getPool().execute<KeyPairWithId>("generateKeyPairWithId" as TaskType, {
		algorithm,
	});
}

export async function signCertificateAsync(
	options: SignOptions
): Promise<SignedCertificate> {
	if (remoteClient) {
		return await remoteClient.signCertificate(options);
	}
	return await getPool().execute<SignedCertificate>(
		"signCertificate" as TaskType,
		options as unknown as Record<string, unknown>
	);
}

export async function createCsrAsync(options: CsrOptions): Promise<string> {
	if (remoteClient) {
		return await remoteClient.createCsr(options);
	}
	return await getPool().execute<string>(
		"createCsr" as TaskType,
		options as unknown as Record<string, unknown>
	);
}

export async function validateCertificateAsync(
	input: CertificateValidationInput
): Promise<ValidationResult> {
	if (remoteClient) {
		return await remoteClient.validateCertificate(input);
	}
	return await getPool().execute<ValidationResult>(
		"validateCertificate" as TaskType,
		input as unknown as Record<string, unknown>
	);
}

export async function parseKeyAsync(privateKey: string): Promise<KeyPair> {
	if (remoteClient) {
		return await remoteClient.parseKey(privateKey);
	}
	return await getPool().execute<KeyPair>("parseKey" as TaskType, { privateKey });
}

export async function signAsync(input: SignInput): Promise<string> {
	if (remoteClient) {
		return await remoteClient.sign(input);
	}
	return await getPool().execute<string>(
		"sign" as TaskType,
		input as unknown as Record<string, unknown>
	);
}
