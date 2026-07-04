import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { ENV } from "../config/env";
import { CertificateAuthority } from "../core/ca";
import { Distributor } from "../core/distributor";
import { Rotator } from "../core/rotator";
import { CaStore } from "../persistence/ca-store";
import { CertificateStore } from "../persistence/certificate-store";
import { CrlStore } from "../persistence/crl-store";
import { CONTAINER } from "./container";
import { createServer } from "./server";

createBootstrap({
	name: "CertificateAuthority",
	createServer,
	onStart: async () => {
		CONTAINER.certificateStore = new CertificateStore(ENV.MONGODB_URI);
		CONTAINER.crlStore = new CrlStore(ENV.MONGODB_URI);
		CONTAINER.caStore = new CaStore(ENV.MONGODB_URI);

		await CONTAINER.certificateStore.connect();
		await CONTAINER.crlStore.connect();
		await CONTAINER.caStore.connect();

		CONTAINER.ca = new CertificateAuthority({
			caKeyPath: ENV.CA_KEY_PATH,
			caCertTtlMs: ENV.CA_CERT_TTL_MS,
			certificateStore: CONTAINER.certificateStore,
			crlStore: CONTAINER.crlStore,
			caStore: CONTAINER.caStore,
		});
		await CONTAINER.ca.initialize();

		CONTAINER.distributor = new Distributor({
			ca: CONTAINER.ca,
			certificateStore: CONTAINER.certificateStore,
			crlStore: CONTAINER.crlStore,
		});

		const rotator = new Rotator({
			ca: CONTAINER.ca,
			certificateStore: CONTAINER.certificateStore,
			intervalMs: ENV.CERT_ROTATION_INTERVAL_MS,
			marginMs: ENV.CERT_ROTATION_MARGIN_MS,
			defaultTtlMs: ENV.CERT_DEFAULT_TTL_MS,
		});
		rotator.start();
	},
	onStop: async () => {
		await CONTAINER.certificateStore?.disconnect();
		await CONTAINER.crlStore?.disconnect();
		await CONTAINER.caStore?.disconnect();
	},
});

export { CONTAINER };
