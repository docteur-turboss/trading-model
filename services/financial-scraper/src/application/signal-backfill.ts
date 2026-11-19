import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillAssetHoles, type SignalRegistry } from "../config/signal-registry";
import { dailyRequests } from "../domain/signals";
import { SignalCollector } from "./signal-collector";

const USAGE = `Backfill the history of a signal source, run inside the collector pod:
  node dist/application/signal-backfill.js --source <id> [--asset <id>] --from <YYYY-MM-DD> --to <YYYY-MM-DD>
Same ids as the normal collection: a replay or an overlap stores nothing twice.
Run it again after a failure: it resumes after the last stored page.`;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface BackfillDeps {
	registry: SignalRegistry;
	collector: Pick<SignalCollector, "backfillPage">;
	now(): number;
	sleep(ms: number): Promise<void>;
	/** Last stored day of a backfill, by key. */
	progress: {
		get(key: string): string | undefined;
		set(key: string, day: string): void;
	};
	out(text: string): void;
	err(text: string): void;
}

function _day(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Runs `signal-backfill`; resolves to the process exit code (0 done, 1 failed or quota reached, 2 refused). */
export async function runBackfill(
	args: string[],
	deps: BackfillDeps
): Promise<number> {
	const opts = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		opts.set(args[i] ?? "", args[i + 1] ?? "");
	}
	const known = ["--source", "--asset", "--from", "--to"];
	if ([...opts.keys()].some((flag) => !known.includes(flag))) {
		deps.err(USAGE);
		return 2;
	}
	const [sourceId, assetId, from, to] = known.map((name) => opts.get(name));
	const source = deps.registry.sources.find(({ id }) => id === sourceId);
	if (!(source && from && to)) {
		deps.err(USAGE);
		return 2;
	}
	if (!source.history) {
		deps.err(`Source ${source.id} declares no history request`);
		return 2;
	}
	const real = (date: string) =>
		DATE.test(date) && _day(Date.parse(date)) === date;
	if (!(real(from) && real(to)) || from > to || to > _day(deps.now())) {
		deps.err("Dates must be YYYY-MM-DD, from <= to, to not in the future");
		return 2;
	}
	const requests = source.requests.filter(
		({ subject }) =>
			"assetId" in subject && (!assetId || subject.assetId === assetId)
	);
	if (requests.length === 0) {
		deps.err(`Source ${source.id} has no request for asset ${assetId ?? "*"}`);
		return 2;
	}
	const { url, pageDays } = source.history;
	const spacingMs = 60_000 / source.accessPolicy.maxRequestsPerMinute;
	// The normal collection keeps its share of the daily quota; runs of the same UTC day share the rest.
	const limit =
		source.accessPolicy.maxRequestsPerDay === undefined
			? Number.POSITIVE_INFINITY
			: source.accessPolicy.maxRequestsPerDay - dailyRequests(source);
	let sent = false;
	for (const request of requests) {
		const asset = deps.registry.assets.get(
			"assetId" in request.subject ? request.subject.assetId : ""
		);
		const template = asset && fillAssetHoles(url, asset);
		if (!(asset && template)) {
			deps.err(
				`Asset of ${JSON.stringify(request.subject)} fits no history url`
			);
			return 2;
		}
		const key = `${source.id}:${asset.id}:${from}:${to}`;
		const done = deps.progress.get(key);
		let start = Date.parse(done ?? from) + (done ? DAY_MS : 0);
		while (start <= Date.parse(to)) {
			const end = Math.min(start + (pageDays - 1) * DAY_MS, Date.parse(to));
			const quotaKey = `quota:${source.id}:${_day(deps.now())}`;
			const used = Number(deps.progress.get(quotaKey) ?? 0);
			if (used >= limit) {
				deps.err(`Daily quota reached at ${_day(start)}: run again tomorrow`);
				return 1;
			}
			if (sent) {
				await deps.sleep(spacingMs);
			}
			sent = true;
			deps.progress.set(quotaKey, String(used + 1));
			try {
				await deps.collector.backfillPage(source, {
					...request,
					url: template
						.replace("{from}", _day(start))
						.replace("{to}", _day(end)),
				});
			} catch (err) {
				deps.err(
					`Backfill of ${asset.id} failed at ${_day(start)}: ${err instanceof Error ? err.message : String(err)}`
				);
				return 1;
			}
			deps.progress.set(key, _day(end));
			deps.out(`${asset.id} stored up to ${_day(end)}`);
			start = end + DAY_MS;
		}
	}
	return 0;
}

/** Wires the real store and workers; loaded only when run as a command (the modules open connections on import). */
async function _main(): Promise<number> {
	const { sleep } = await import("@trading-model/common/utils/sleep");
	const { MySqlSignalStore } = await import(
		"../adapters/outbound/persistence/signal-store.js"
	);
	const { createProtocolWorkers } = await import(
		"../adapters/outbound/signal-sources/protocol-workers.js"
	);
	const { SOURCE_ADAPTERS } = await import(
		"../adapters/outbound/signal-sources/source-adapters.js"
	);
	const { signalUserAgent } = await import("../config/container.js");
	const { closeDatabase } = await import("../config/db.js");
	const { SIGNAL_REGISTRY } = await import("../config/signal-registry.js");
	const { ENV } = await import("../infrastructure/config/env.js");
	// shortcut: progress lives in the pod's temp dir, so a new pod starts over (harmless: same ids); upgrade if backfills grow long.
	const file = join(tmpdir(), "signal-backfill-progress.json");
	const read = (): Record<string, string> =>
		existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	try {
		return await runBackfill(process.argv.slice(2), {
			registry: SIGNAL_REGISTRY,
			collector: new SignalCollector({
				workers: createProtocolWorkers(
					signalUserAgent(ENV.SIGNAL_CONTACT_EMAIL)
				),
				adapters: SOURCE_ADAPTERS,
				store: MySqlSignalStore,
				now: Date.now,
				sleep,
			}),
			now: Date.now,
			sleep,
			progress: {
				get: (key) => read()[key],
				set: (key, day) =>
					writeFileSync(file, JSON.stringify({ ...read(), [key]: day })),
			},
			out: (text) => console.log(text),
			err: (text) => console.error(text),
		});
	} finally {
		await closeDatabase();
	}
}

if (require.main === module) {
	_main().then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error(err);
			process.exit(1);
		}
	);
}
