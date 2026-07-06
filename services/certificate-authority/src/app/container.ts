import type { CertificateAuthority } from "../core/ca";
import type { Distributor } from "../core/distributor";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

class Container {
	private _ca: CertificateAuthority | undefined;
	private _certificateStore: CertificateStore | undefined;
	private _crlStore: CrlStore | undefined;
	private _caStore: CaStore | undefined;
	private _distributor: Distributor | undefined;

	get ca(): CertificateAuthority {
		if (!this._ca) throw new Error("CONTAINER not initialized: ca");
		return this._ca;
	}
	set ca(value: CertificateAuthority) { this._ca = value; }

	get certificateStore(): CertificateStore {
		if (!this._certificateStore) throw new Error("CONTAINER not initialized: certificateStore");
		return this._certificateStore;
	}
	set certificateStore(value: CertificateStore) { this._certificateStore = value; }

	get crlStore(): CrlStore {
		if (!this._crlStore) throw new Error("CONTAINER not initialized: crlStore");
		return this._crlStore;
	}
	set crlStore(value: CrlStore) { this._crlStore = value; }

	get caStore(): CaStore {
		if (!this._caStore) throw new Error("CONTAINER not initialized: caStore");
		return this._caStore;
	}
	set caStore(value: CaStore) { this._caStore = value; }

	get distributor(): Distributor {
		if (!this._distributor) throw new Error("CONTAINER not initialized: distributor");
		return this._distributor;
	}
	set distributor(value: Distributor) { this._distributor = value; }

	async disconnectAll(): Promise<void> {
		await this._certificateStore?.disconnect();
		await this._crlStore?.disconnect();
		await this._caStore?.disconnect();
	}
}

export const CONTAINER = new Container();
