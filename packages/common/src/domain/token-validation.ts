/** Payload for validating an instance authentication token. */
export interface TokenValidation {
	token: string;
	instanceId: string;
}
