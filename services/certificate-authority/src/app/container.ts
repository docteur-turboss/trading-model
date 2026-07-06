import type { CertificateAuthority } from "../core/ca";
import type { Distributor } from "../core/distributor";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";
import type { CaStore } from "../persistence/ca-store";

export class Container {
	constructor(
		public readonly ca: CertificateAuthority,
		public readonly certificateStore: CertificateStore,
		public readonly crlStore: CrlStore,
		public readonly caStore: CaStore,
		public readonly distributor: Distributor,
	) {}

	async disconnectAll(): Promise<void> {
		await this.certificateStore.disconnect();
		await this.crlStore.disconnect();
		await this.caStore.disconnect();
	}
}
