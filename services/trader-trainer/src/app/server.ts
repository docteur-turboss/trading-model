import type { Port } from "@trading-model/common/domain/primitives";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { ResponseException } from "@trading-model/common/middleware/response-exception";
import {
	buildTlsFromEnv,
	createSecureServer,
} from "@trading-model/common/server/create-secure-server";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../config/env";
import { MessageManagerListenExpress } from "../config/message-manager";
import type { Trainer } from "../core/trainer";

/** Create and return a secure Express server with trader-trainer routes. */
export function createServer(trainer: Trainer) {
	return createSecureServer({
		port: ENV.PORT as Port,
		tls: buildTlsFromEnv(ENV),
		routes: (app) => {
			app.get("/best-agent", createBestAgentHandler(trainer));
			app.get("/training-status", createTrainingStatusHandler(trainer));

			ADDRESS_MANAGER_ROUTES(app);
			MessageManagerListenExpress(app);
		},
	});
}

function createBestAgentHandler(trainer: Trainer) {
	return catchSync((_req, res) => {
		const summary = trainer.getBestAgentSummary();
		if (!summary) {
			_sendNotFound(res);
			return;
		}

		_sendBestAgentResponse(res, trainer, summary);
	});
}

function _sendNotFound(res: import("express").Response): void {
	const response = ResponseException(
		"No trained agent available at the moment."
	).notFound();
	res.status(response.status).json({ data: response.data });
}

function _sendBestAgentResponse(
	res: import("express").Response,
	trainer: Trainer,
	summary: import("../core/trainer").BestAgentSummary
): void {
	res.json({
		data: {
			agent: summary,
			training: trainer.isTraining(),
			symbol: trainer.getCurrentSymbol(),
			generation: trainer.getGeneration(),
		},
	});
}

function createTrainingStatusHandler(trainer: Trainer) {
	return catchSync((_req, res) => {
		res.json({
			data: {
				training: trainer.isTraining(),
				symbol: trainer.getCurrentSymbol(),
				generation: trainer.getGeneration(),
			},
		});
	});
}
