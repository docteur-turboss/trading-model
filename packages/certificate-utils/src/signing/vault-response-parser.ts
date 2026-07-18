export enum HashAlgorithm {
	Sha256 = "sha256",
	Sha384 = "sha384",
	Sha512 = "sha512",
	Sha1 = "sha1",
}

const HASH_ALGORITHM_VAULT_MAP: Record<HashAlgorithm, string> = {
	[HashAlgorithm.Sha256]: "sha2-256",
	[HashAlgorithm.Sha384]: "sha2-384",
	[HashAlgorithm.Sha512]: "sha2-512",
	[HashAlgorithm.Sha1]: "sha1",
};

export function getHashAlgorithm(algorithm: HashAlgorithm): string {
	return HASH_ALGORITHM_VAULT_MAP[algorithm] ?? "sha2-256";
}

export function getSignatureString(result: {
	data: { signature: string };
}): string {
	const raw = result.data.signature;
	const colonIdx = raw.lastIndexOf(":");
	return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
}

export function getLatestKeyVersion(
	name: string,
	keys: Record<string, string>
): string {
	const versions = Object.keys(keys);
	if (versions.length === 0) {
		throw new Error(`Key "${name}" has no versions`);
	}
	const sorted = versions.sort((_prev, _next) => Number(_next) - Number(_prev));
	return keys[sorted[0]];
}
