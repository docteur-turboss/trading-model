import type { CertificateEntry } from "../types/dtos";
import { request } from "./_request";

export const certificateApi = {
	getCertificates: () => request<CertificateEntry[]>("GET", "/ca/certificates"),
	revokeCertificate: (id: string) =>
		request<void>("POST", "/ca/revoke", { certificateId: id }),
};
