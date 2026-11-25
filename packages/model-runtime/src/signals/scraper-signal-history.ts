import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import {
	AssetSignalsResponse,
	type Signal,
} from "@trading-model/contracts/wire/signals";
import { HttpClient } from "@trading-model/http/http-client";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";

/** Stored signals of an asset, served by the scraper (ADR-0036). */
export interface SignalHistoryPort {
	/**
	 * Every signal of `assetId` (own, sector and area) observed in
	 * `[from, to]` (epoch ms), oldest first, no duplicate: nothing observed
	 * after `to` is read (point-in-time, ADR-0030).
	 */
	loadWindow(assetId: string, from: number, to: number): Promise<Signal[]>;
}

/**
 * Reads signals through the scraper's route `GET /v2/signals/assets/:assetId`;
 * a window the route cuts (`truncated`) is read again from its last signal.
 */
export class ScraperSignalHistory implements SignalHistoryPort {
	private readonly _http: HttpClient;

	constructor(
		tls: TlsPaths,
		private readonly _find: (name: ServiceInstanceName) => Promise<HostPort>
	) {
		this._http = HttpClient.createWithTls(tls);
	}

	async loadWindow(
		assetId: string,
		from: number,
		to: number
	): Promise<Signal[]> {
		const target = await this._find(
			ServiceInstanceName.FinancialScraperService
		);
		const base = `https://${HostPort.toAddress(target)}/v2/signals/assets/${assetId}`;
		const end = to + 1; // the route's `to` is exclusive
		const seen = new Set<string>();
		const signals: Signal[] = [];
		let cursor = from;
		while (cursor < end) {
			const query = `from=${new Date(cursor).toISOString()}&to=${new Date(end).toISOString()}`;
			const answer = await this._http.get(
				URLString.of(`${base}?${query}`),
				{ serviceName: ServiceId.of("financial-scraper") },
				AssetSignalsResponse
			);
			if (!answer) {
				throw new Error(`Empty signal answer for ${assetId}`);
			}
			let added = 0;
			for (const signal of answer.signals) {
				if (Date.parse(signal.observedAt) <= to && !seen.has(signal.id)) {
					seen.add(signal.id);
					signals.push(signal);
					added++;
				}
			}
			const last = answer.signals[answer.signals.length - 1];
			if (!(answer.truncated && last)) {
				break;
			}
			// shortcut: a page of one instant only moves past it, so signals of that
			// instant beyond the page cap are lost; upgrade with a cursor on the route.
			cursor = Date.parse(last.observedAt) + (added === 0 ? 1 : 0);
		}
		return signals;
	}
}
