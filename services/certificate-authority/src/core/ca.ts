import type {
	RevokedCertificate,
	SignedCertificate,
} from "@trading-model/certificate-utils/keygen/types";
import type { CertSigner } from "@trading-model/common/domain/cert-signer.interface";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import type {
	CaPem,
	DurationMs,
	FilePath,
} from "@trading-model/common/domain/primitives";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

import { type BootstrapResult, CaBootstrapper } from "./ca-bootstrapper";
import { CertificateOperator } from "./certificate-operator";

export interface CaOptions {
	caKeyPath: FilePath;
	caCertTtlMs: DurationMs;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
	caStore: CaStore;
}

export class CertificateAuthority implements CertSigner<SignedCertificate> {
	private readonly _state: BootstrapResult;
	private readonly _operator: CertificateOperator;

	private constructor(state: BootstrapResult, options: CaOptions) {
		this._state = state;
		this._operator = new CertificateOperator(
			options.certificateStore,
			options.crlStore
		);
	}

	static async create(options: CaOptions): Promise<CertificateAuthority> {
		const bootstrapper = new CaBootstrapper(
			options.caKeyPath,
			options.caCertTtlMs
		);
		const state = await bootstrapper.loadOrBootstrap(options.caStore);
		return new CertificateAuthority(state, options);
	}

	signCertificate(request: CertSignRequest): Promise<SignedCertificate> {
		return this._operator.signCertificate(request, {
			caKeyPair: this._state.caKeyPair,
			caCertPem: this._state.caCertPem,
		});
	}

	async revokeCertificate(request: RevocationRequest): Promise<void> {
		await this._operator.revokeCertificate(request);
	}

	getCrl(): Promise<RevokedCertificate[]> {
		return this._operator.getCrl();
	}

	getCaCertPem(): CaPem {
		return this._state.caCertPem;
	}

	isInitialized(): boolean {
		return true;
	}
}
