import type { AuthToken, CsrPem, DurationMs, ServiceId } from "./primitives";

export interface CertSignRequest {
	serviceId: ServiceId;
	csr: CsrPem;
	ttlMs?: DurationMs;
	bootstrapToken?: AuthToken;
}
