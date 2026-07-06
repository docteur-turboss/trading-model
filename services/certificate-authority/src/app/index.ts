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
		CONTAINER.certificateStore = await CertificateStore.connect(ENV.MONGODB_URI);
		CONTAINER.crlStore = await CrlStore.connect(ENV.MONGODB_URI);
		CONTAINER.caStore = await CaStore.connect(ENV.MONGODB_URI);

		CONTAINER.ca = await CertificateAuthority.create({
			caKeyPath: ENV.CA_KEY_PATH,
			caCertTtlMs: ENV.CA_CERT_TTL_MS,
			certificateStore: CONTAINER.certificateStore,
			crlStore: CONTAINER.crlStore,
			caStore: CONTAINER.caStore,
		});

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
		await CONTAINER.disconnectAll();
	},
});

export { CONTAINER };
