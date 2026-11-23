/** Minimum length of a production secret. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Why a secret is too weak for production, or `undefined` when it is fine.
 * The reason never quotes the secret.
 */
export function weakSecretReason(secret: string): string | undefined {
	if (secret.length < MIN_SECRET_LENGTH) {
		return `must be at least ${MIN_SECRET_LENGTH} characters`;
	}
	if (/change-?me/i.test(secret)) {
		return "must not be a placeholder value (change-me)";
	}
	return undefined;
}
