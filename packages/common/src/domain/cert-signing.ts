export interface CertSignRequest {
	serviceId: string;
	csr: string;
	ttlMs?: number;
	bootstrapToken?: string;
}
