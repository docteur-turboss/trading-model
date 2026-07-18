import type { CertSignRequest } from "./cert-signing";

export interface CertSigner<TOutput> {
	signCertificate(request: CertSignRequest): Promise<TOutput>;
}
