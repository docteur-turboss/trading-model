import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { ENV } from "../config/env";
import { CertificateAuthority } from "../core/ca";
import { Distributor } from "../core/distributor";
import { Rotator } from "../core/rotator";
import { CaStore } from "../persistence/ca-store";
import { CertificateStore } from "../persistence/certificate-store";
import { CrlStore } from "../persistence/crl-store";
import { MONGO_MANAGER } from "../persistence/mongo-manager";
import { Container } from "./container";
import { createServer } from "./server";

let container: Container;

async function _initStores() {
	const certificateStore = await CertificateStore.connect();
	const crlStore = await CrlStore.connect();
	const caStore = await CaStore.connect();
	return { certificateStore, crlStore, caStore };
}

function _initCertificateAuthority(
	stores: Awaited<ReturnType<typeof _initStores>>
): Promise<CertificateAuthority> {
	return CertificateAuthority.create({
		caKeyPath: ENV.CA_KEY_PATH,
		caCertTtlMs: ENV.CA_CERT_TTL_MS,
		certificateStore: stores.certificateStore,
		crlStore: stores.crlStore,
		caStore: stores.caStore,
	});
}

function _initRotator(
	ca: CertificateAuthority,
	certificateStore: CertificateStore
): Rotator {
	const rotator = new Rotator({
		ca,
		certificateStore,
		intervalMs: ENV.CERT_ROTATION_INTERVAL_MS,
		marginMs: ENV.CERT_ROTATION_MARGIN_MS,
		defaultTtlMs: ENV.CERT_DEFAULT_TTL_MS,
	});
	rotator.start();
	return rotator;
}

createBootstrap({
	name: "CertificateAuthority",
	createServer,
	onStart: async () => {
		await MONGO_MANAGER.initialize(ENV.MONGODB_URI);
		const stores = await _initStores();
		const ca = await _initCertificateAuthority(stores);
		const distributor = new Distributor({
			ca,
			certificateStore: stores.certificateStore,
			crlStore: stores.crlStore,
		});
		container = new Container(
			ca,
			stores.certificateStore,
			stores.crlStore,
			stores.caStore,
			distributor
		);
		_initRotator(ca, stores.certificateStore);
	},
	onStop: async () => {
		if (container) {
			await container.disconnectAll();
		}
	},
});

export { container };
