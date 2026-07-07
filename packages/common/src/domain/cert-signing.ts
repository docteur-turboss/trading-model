import type { AuthToken, ServiceId } from "./primitives";

export interface CertSignRequest {
	serviceId: ServiceId;
	csr: string;
	ttlMs?: number;
	bootstrapToken?: AuthToken;
}
