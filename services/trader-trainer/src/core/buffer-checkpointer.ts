import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "./market-data-buffer";
import { BufferSaver } from "./buffer-saver";
import { BufferLoader } from "./buffer-loader";

export class BufferCheckpointer {
	private readonly _saver: BufferSaver;
	private readonly _loader: BufferLoader;

	constructor(private readonly _checkpointDir: string) {
		this._saver = new BufferSaver(_checkpointDir);
		this._loader = new BufferLoader(_checkpointDir);
	}

	saveBuffer(buffer: MarketDataBuffer): void {
		this._saver.save(buffer);
	}

	save(buffer: MarketDataBuffer): void {
		this._saver.save(buffer);
	}

	loadBuffer(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		return this._loader.load(config);
	}

	load(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		return this._loader.load(config);
	}
}
