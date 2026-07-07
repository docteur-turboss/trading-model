import type { CertificateAuthority } from "../core/ca";
import type { Distributor } from "../core/distributor";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";
import { MONGO_MANAGER } from "../persistence/mongo-manager";

export class Container {
	constructor(
		public readonly ca: CertificateAuthority,
		public readonly certificateStore: CertificateStore,
		public readonly crlStore: CrlStore,
		public readonly caStore: CaStore,
		public readonly distributor: Distributor
	) {}

	async disconnectAll(): Promise<void> {
		await MONGO_MANAGER.close();
	}
}
