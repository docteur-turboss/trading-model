import { catchSync } from "@trading-model/common/middleware/catch-error";
import { ResponseException } from "@trading-model/common/middleware/response-exception";
import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { loadTlsConfig } from "@trading-model/common/server/load-tls-config";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { env } from "../config/env";
import { MessageManagerListenExpress } from "../config/message-manager";
import type { Trainer } from "../core/trainer";

/** Create and return a secure Express server with trader-trainer routes. */
export function createServer(trainer: Trainer) {
	return createSecureServer({
		port: env.PORT,
		tls: loadTlsConfig(env.TLS_KEY_PATH, env.TLS_CERT_PATH, env.TLS_CA_PATH),
		routes: (app) => {
			app.get(
				"/best-agent",
				catchSync((_req, res) => {
					const summary = trainer.getBestAgentSummary();
					if (!summary) {
						const response = ResponseException(
							"Aucun agent entrainé disponible pour le moment."
						).notFound();
						res.status(response.status).json({ data: response.data });
						return;
					}

					res.json({
						data: {
							agent: summary,
							training: trainer.isTraining(),
							symbol: trainer.getCurrentSymbol(),
							generation: trainer.getGeneration(),
						},
					});
				})
			);

			app.get(
				"/training-status",
				catchSync((_req, res) => {
					res.json({
						data: {
							training: trainer.isTraining(),
							symbol: trainer.getCurrentSymbol(),
							generation: trainer.getGeneration(),
						},
					});
				})
			);

			ADDRESS_MANAGER_ROUTES(app);
			MessageManagerListenExpress(app);
		},
	});
}
