import type {
	RevokedCertificate,
	SignedCertificate,
} from "@trading-model/certificate-utils/types";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { SerialNumber } from "@trading-model/common/domain/primitives";
import type { SignServiceCertRequest } from "../domain/cert-renewal-service";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

import { type BootstrapResult, CaBootstrapper } from "./ca-bootstrapper";
import { CertificateOperator } from "./certificate-operator";

export interface CaOptions {
	caKeyPath: string;
	caCertTtlMs: number;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
	caStore: CaStore;
}

export interface CertBodyInput {
	serialNumber: SerialNumber;
	now: Date;
	expiresAt: Date;
	publicKey: string;
}

export class CertificateAuthority {
	private _state!: BootstrapResult;
	private readonly _bootstrapper: CaBootstrapper;
	private readonly _operator: CertificateOperator;
	private readonly _caStore: CaStore;

	private constructor(options: CaOptions) {
		this._caStore = options.caStore;
		this._bootstrapper = new CaBootstrapper(
			options.caKeyPath,
			options.caCertTtlMs
		);
		this._operator = new CertificateOperator(
			options.certificateStore,
			options.crlStore
		);
	}

	static async create(options: CaOptions): Promise<CertificateAuthority> {
		const ca = new CertificateAuthority(options);
		await ca.initialize();
		return ca;
	}

	async initialize(): Promise<void> {
		this._state = await this._bootstrapper.loadOrBootstrap(this._caStore);
	}

	async signServiceCertificate(
		request: SignServiceCertRequest
	): Promise<SignedCertificate> {
		return this._operator.signServiceCertificate(
			request,
			this._state.caKeyPair,
			this._state.caCertPem
		);
	}

	async revokeCertificate(request: RevocationRequest): Promise<void> {
		await this._operator.revokeCertificate(request);
	}

	async getCrl(): Promise<RevokedCertificate[]> {
		return this._operator.getCrl();
	}

	getCaCertPem(): string {
		return this._state.caCertPem;
	}

	isInitialized(): boolean {
		return true;
	}
}
