import type { CertificateAuthority } from "../core/ca";
import type { Distributor } from "../core/distributor";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

export const CONTAINER: {
	ca: CertificateAuthority;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
	caStore: CaStore;
	distributor: Distributor;
} = {
	ca: undefined as unknown as CertificateAuthority,
	certificateStore: undefined as unknown as CertificateStore,
	crlStore: undefined as unknown as CrlStore,
	caStore: undefined as unknown as CaStore,
	distributor: undefined as unknown as Distributor,
};
