import { KeyAlgorithm } from "../keygen/generate-key-pair";
import type {
	KeyPair,
	KeyPairWithId,
	SignedCertificate,
	SignInput,
} from "../keygen/types";
import type { CsrOptions } from "../signing/create-csr";
import type { RemoteSigningClient } from "../signing/remote-signing-client";
import type { SignOptions } from "../signing/sign-certificate";
import type {
	CertificateValidationInput,
	ValidationResult,
} from "../validation/validate-certificate";
import { getPool } from "./lazy-pool";
import { WorkerTaskType } from "./worker-task-type";

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
	return await getPool().execute<KeyPair>(WorkerTaskType.GenerateKeyPair, {
		algorithm,
	});
}

export async function generateKeyPairWithIdAsync(
	algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
): Promise<KeyPairWithId> {
	if (remoteClient) {
		return await remoteClient.generateKeyPairWithId(algorithm);
	}
	return await getPool().execute<KeyPairWithId>(
		WorkerTaskType.GenerateKeyPairWithId,
		{
			algorithm,
		}
	);
}

export async function signCertificateAsync(
	options: SignOptions
): Promise<SignedCertificate> {
	if (remoteClient) {
		return await remoteClient.signCertificate(options);
	}
	return await getPool().execute<SignedCertificate>(
		WorkerTaskType.SignCertificate,
		options
	);
}

export async function createCsrAsync(options: CsrOptions): Promise<string> {
	if (remoteClient) {
		return await remoteClient.createCsr(options);
	}
	return await getPool().execute<string>(WorkerTaskType.CreateCsr, options);
}

export async function validateCertificateAsync(
	input: CertificateValidationInput
): Promise<ValidationResult> {
	if (remoteClient) {
		return await remoteClient.validateCertificate(input);
	}
	return await getPool().execute<ValidationResult>(
		WorkerTaskType.ValidateCertificate,
		input
	);
}

export async function parseKeyAsync(privateKey: string): Promise<KeyPair> {
	if (remoteClient) {
		return await remoteClient.parseKey(privateKey);
	}
	return await getPool().execute<KeyPair>(WorkerTaskType.ParseKey, {
		privateKey,
	});
}

export async function signAsync(input: SignInput): Promise<string> {
	if (remoteClient) {
		return await remoteClient.sign(input);
	}
	return await getPool().execute<string>(WorkerTaskType.Sign, input);
}
