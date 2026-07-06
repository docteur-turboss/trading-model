/** Parameters for revoking a certificate. */
export interface RevocationRequest {
	serialNumber: string;
	reason: string;
}
