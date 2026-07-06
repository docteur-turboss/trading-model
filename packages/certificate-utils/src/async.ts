import type { CsrOptions } from "./create-csr";
import { KeyAlgorithm } from "./generate-key-pair";
import { getPool } from "./lazy-pool";
import type { RemoteSigningClient } from "./remote-signing-client";
import type { SignOptions } from "./sign-certificate";
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

let remoteClient: RemoteSigningClient | null = null;

export function setRemoteSigningClient(
	client: RemoteSigningClient | null
): void {
	remoteClient = client;
}

export async function generateKeyPairAsync(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): Promise<KeyPair> {
	if (remoteClient) {
		return await remoteClient.generateKeyPair(algorithm);
	}
	return await getPool().execute<KeyPair>("generateKeyPair", { algorithm });
}

export async function generateKeyPairWithIdAsync(
	algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
): Promise<KeyPairWithId> {
	if (remoteClient) {
		return await remoteClient.generateKeyPairWithId(algorithm);
	}
	return await getPool().execute<KeyPairWithId>("generateKeyPairWithId", {
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
		"signCertificate",
		options as unknown as Record<string, unknown>
	);
}

export async function createCsrAsync(options: CsrOptions): Promise<string> {
	if (remoteClient) {
		return await remoteClient.createCsr(options);
	}
	return await getPool().execute<string>(
		"createCsr",
		options as unknown as Record<string, unknown>
	);
}

export async function validateCertificateAsync(
	input: CertificateValidationInput
): Promise<ValidationResult> {
	const { certPem, caCertPem } = input;
	if (remoteClient) {
		return await remoteClient.validateCertificate(certPem);
	}
	return await getPool().execute<ValidationResult>("validateCertificate", {
		certPem,
		caCertPem,
	});
}

export async function parseKeyAsync(privateKey: string): Promise<KeyPair> {
	if (remoteClient) {
		return await remoteClient.parseKey(privateKey);
	}
	return await getPool().execute<KeyPair>("parseKey", { privateKey });
}

export async function signAsync(input: SignInput): Promise<string> {
	if (remoteClient) {
		return await remoteClient.sign(input);
	}
	return await getPool().execute<string>(
		"sign",
		input as unknown as Record<string, unknown>
	);
}
