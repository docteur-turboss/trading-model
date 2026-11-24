import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "@trading-model/common/utils/run-cli";
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

type Source = SignalRegistry["sources"][number];
interface Plan {
	source: Source;
	from: string;
	to: string;
	requests: Source["requests"];
}

/** Flags of the command, in the order source, asset, from, to; undefined on an unknown flag. */
function _parseArgs(args: string[]): (string | undefined)[] | undefined {
	const opts = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		opts.set(args[i] ?? "", args[i + 1] ?? "");
	}
	const known = ["--source", "--asset", "--from", "--to"];
	if ([...opts.keys()].some((flag) => !known.includes(flag))) {
		return undefined;
	}
	return known.map((name) => opts.get(name));
}

function _validWindow(from: string, to: string, today: string): boolean {
	const real = (date: string) =>
		DATE.test(date) && _day(Date.parse(date)) === date;
	return real(from) && real(to) && from <= to && to <= today;
}

/** The work to do, or the message of the refusal (exit code 2). */
function _plan(args: string[], deps: BackfillDeps): Plan | string {
	const parsed = _parseArgs(args);
	if (!parsed) {
		return USAGE;
	}
	const [sourceId, assetId, from, to] = parsed;
	const source = deps.registry.sources.find(({ id }) => id === sourceId);
	if (!(source && from && to)) {
		return USAGE;
	}
	if (!source.history) {
		return `Source ${source.id} declares no history request`;
	}
	if (!_validWindow(from, to, _day(deps.now()))) {
		return "Dates must be YYYY-MM-DD, from <= to, to not in the future";
	}
	const requests = source.requests.filter(
		({ subject }) =>
			"assetId" in subject && (!assetId || subject.assetId === assetId)
	);
	if (requests.length === 0) {
		return `Source ${source.id} has no request for asset ${assetId ?? "*"}`;
	}
	return { source, from, to, requests };
}

interface Pacing {
	limit: number;
	spacingMs: number;
	sent: boolean;
}

/** Stores one page; resolves to an exit code when the run must stop. */
async function _storePage(
	deps: BackfillDeps,
	source: Source,
	request: Source["requests"][number],
	pacing: Pacing,
	page: { assetId: string; url: string; start: number; end: number }
): Promise<number | undefined> {
	const quotaKey = `quota:${source.id}:${_day(deps.now())}`;
	const used = Number(deps.progress.get(quotaKey) ?? 0);
	if (used >= pacing.limit) {
		deps.err(`Daily quota reached at ${_day(page.start)}: run again tomorrow`);
		return 1;
	}
	if (pacing.sent) {
		await deps.sleep(pacing.spacingMs);
	}
	pacing.sent = true;
	deps.progress.set(quotaKey, String(used + 1));
	try {
		await deps.collector.backfillPage(source, { ...request, url: page.url });
	} catch (err) {
		deps.err(
			`Backfill of ${page.assetId} failed at ${_day(page.start)}: ${err instanceof Error ? err.message : String(err)}`
		);
		return 1;
	}
	return undefined;
}

/** Backfills one request page by page; resolves to an exit code when the run must stop. */
async function _backfillAsset(
	deps: BackfillDeps,
	{ source, from, to }: Plan,
	request: Source["requests"][number],
	pacing: Pacing
): Promise<number | undefined> {
	const { url, pageDays } = source.history as NonNullable<Source["history"]>;
	const asset = deps.registry.assets.get(
		"assetId" in request.subject ? request.subject.assetId : ""
	);
	const template = asset && fillAssetHoles(url, asset);
	if (!(asset && template)) {
		deps.err(`Asset of ${JSON.stringify(request.subject)} fits no history url`);
		return 2;
	}
	const key = `${source.id}:${asset.id}:${from}:${to}`;
	const done = deps.progress.get(key);
	let start = Date.parse(done ?? from) + (done ? DAY_MS : 0);
	while (start <= Date.parse(to)) {
		const end = Math.min(start + (pageDays - 1) * DAY_MS, Date.parse(to));
		const stop = await _storePage(deps, source, request, pacing, {
			assetId: asset.id,
			url: template.replace("{from}", _day(start)).replace("{to}", _day(end)),
			start,
			end,
		});
		if (stop !== undefined) {
			return stop;
		}
		deps.progress.set(key, _day(end));
		deps.out(`${asset.id} stored up to ${_day(end)}`);
		start = end + DAY_MS;
	}
	return undefined;
}

/** Runs `signal-backfill`; resolves to the process exit code (0 done, 1 failed or quota reached, 2 refused). */
export async function runBackfill(
	args: string[],
	deps: BackfillDeps
): Promise<number> {
	const plan = _plan(args, deps);
	if (typeof plan === "string") {
		deps.err(plan);
		return 2;
	}
	const { accessPolicy } = plan.source;
	const pacing: Pacing = {
		// The normal collection keeps its share of the daily quota; runs of the same UTC day share the rest.
		limit:
			accessPolicy.maxRequestsPerDay === undefined
				? Number.POSITIVE_INFINITY
				: accessPolicy.maxRequestsPerDay - dailyRequests(plan.source),
		spacingMs: 60_000 / accessPolicy.maxRequestsPerMinute,
		sent: false,
	};
	for (const request of plan.requests) {
		const stop = await _backfillAsset(deps, plan, request, pacing);
		if (stop !== undefined) {
			return stop;
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
	runCli(_main);
}
