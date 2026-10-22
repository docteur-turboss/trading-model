import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { ResponseException } from "@trading-model/http/adapters/inbound/response-exception";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";

import {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
} from "../config/address-manager";
import { MessageManagerListenExpress } from "../config/message-manager";
import { metricsHandler } from "../config/metrics";
import type { BestAgentSummary } from "../domain/training-state";
import { ENV } from "../infrastructure/config/env";
import type { Trainer } from "./trainer";

interface AgentResponse {
	symbol: string;
	agent: BestAgentSummary;
	training: boolean;
	generation: number;
}

/** Create and return a secure Express server with trader-trainer routes. */
export function createServer(trainer: Trainer) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("trader-trainer"),
		routes: (app) => {
			app.get("/best-agent", createBestAgentHandler(trainer));
			app.get("/training-status", createTrainingStatusHandler(trainer));
			app.get("/training-agents", createTrainingAgentsHandler(trainer));
			app.get(
				"/training-agents/:symbol",
				createTrainingAgentBySymbolHandler(trainer)
			);
			app.get("/metrics", metricsHandler);

			ADDRESS_MANAGER_ROUTES(app);
			MessageManagerListenExpress(app);
		},
		readiness: [
			{
				name: "message-bus",
				check: async () => {
					try {
						const target = await AddressManager.findService(
							ServiceInstanceName.MessageDeliveryService
						);
						return Boolean(target);
					} catch {
						return false;
					}
				},
			},
		],
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

function createTrainingAgentsHandler(trainer: Trainer) {
	return catchSync((_req, res) => {
		const snapshots = trainer.getAllSnapshots();
		const agents: AgentResponse[] = [];

		for (const [symbol, snapshot] of snapshots) {
			const summary = snapshot.buildBestAgentSummary();
			if (summary) {
				agents.push({
					symbol: String(symbol),
					agent: summary,
					training:
						trainer.isTraining() && trainer.getCurrentSymbol() === symbol,
					generation: snapshot.generation,
				});
			}
		}

		res.json({
			data: {
				agents,
				training: trainer.isTraining(),
				currentSymbol: trainer.getCurrentSymbol(),
			},
		});
	});
}

function createTrainingAgentBySymbolHandler(trainer: Trainer) {
	return catchSync((req, res) => {
		const symbol = req.params.symbol;
		const snapshot = trainer.getSnapshotForSymbol(symbol as never);
		if (!snapshot) {
			const response = ResponseException(
				`No trained agent for symbol ${symbol}.`
			).notFound();
			res.status(response.status).json({ data: response.data });
			return;
		}

		const summary = snapshot.buildBestAgentSummary();
		if (!summary) {
			_sendNotFound(res);
			return;
		}

		res.json({
			data: {
				symbol,
				agent: summary,
				training: trainer.isTraining() && trainer.getCurrentSymbol() === symbol,
				generation: snapshot.generation,
				generationContext: snapshot.generationContext,
			},
		});
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
	summary: BestAgentSummary
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
