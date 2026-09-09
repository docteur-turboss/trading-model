import {
	createDefaultHandlers,
	type DataHandler,
	type DataType,
} from "./data-handlers/data-handler";
import type { SymbolNormalizers, SymbolState } from "./market-data-types";

export class NormalizationManager {
	private readonly _handlerMap: Record<DataType, DataHandler>;
	private readonly _handlers: DataHandler[];

	constructor(handlers?: DataHandler[]) {
		this._handlers = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(
			this._handlers.map((handler) => [handler.dataType, handler])
		) as Record<DataType, DataHandler>;
	}

	createNormStats(): SymbolNormalizers {
		return Object.assign(
			{},
			...this._handlers.map((handler) => handler.createNorms())
		) as SymbolNormalizers;
	}

	updateNorms(dataType: DataType, state: SymbolState, data: unknown): void {
		this._handlerMap[dataType]?.updateNorms(state, data);
	}
}
