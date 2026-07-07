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

let CONTAINER: Container;

createBootstrap({
	name: "CertificateAuthority",
	createServer,
	onStart: async () => {
		await MONGO_MANAGER.initialize(ENV.MONGODB_URI);
		const certificateStore = await CertificateStore.connect();
		const crlStore = await CrlStore.connect();
		const caStore = await CaStore.connect();

		const ca = await CertificateAuthority.create({
			caKeyPath: ENV.CA_KEY_PATH,
			caCertTtlMs: ENV.CA_CERT_TTL_MS,
			certificateStore,
			crlStore,
			caStore,
		});

		const distributor = new Distributor({
			ca,
			certificateStore,
			crlStore,
		});

		CONTAINER = new Container(
			ca,
			certificateStore,
			crlStore,
			caStore,
			distributor
		);

		const rotator = new Rotator({
			ca,
			certificateStore,
			intervalMs: ENV.CERT_ROTATION_INTERVAL_MS,
			marginMs: ENV.CERT_ROTATION_MARGIN_MS,
			defaultTtlMs: ENV.CERT_DEFAULT_TTL_MS,
		});
		rotator.start();
	},
	onStop: async () => {
		if (CONTAINER) {
			await CONTAINER.disconnectAll();
		}
	},
});

export { CONTAINER };
