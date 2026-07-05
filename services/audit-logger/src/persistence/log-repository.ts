import type { Collection, Db } from "mongodb";

const MREGEX = "$regex";
const MOPTIONS = "$options";
const MGTE = "$gte";
const MLTE = "$lte";
const MFACET = "$facet";
const MGROUP = "$group";
const MSUM = "$sum";
const MMIN = "$min";
const MMAX = "$max";
const MCOUNT = "$count";
const MID = "_id";

export interface ServiceLogDocument {
	receivedAt: Date;
	ttl: Date;
	level: "debug" | "info" | "warn" | "error";
	message: string;
	service: {
		name: string;
		instanceId: string;
		version?: string;
	};
	module?: string;
	correlationId?: string;
	context?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
		code?: string;
	};
	request?: {
		method?: string;
		url?: string;
		statusCode?: number;
		durationMs?: number;
	};
	user?: {
		id?: string;
		sessionId?: string;
	};
	environment?: string;
}

export interface LogQuery {
	serviceName?: string;
	level?: string;
	correlationId?: string;
	startDate?: string;
	endDate?: string;
	search?: string;
	page?: number;
	limit?: number;
}

export interface LogStats {
	total: number;
	byService: Record<string, number>;
	byLevel: Record<string, number>;
	dateRange: { earliest?: string; latest?: string };
}

export class LogRepository {
	private _collection?: Collection<ServiceLogDocument>;

	constructor(private readonly _db: Db) {}

	private async _getCollection(): Promise<Collection<ServiceLogDocument>> {
		if (!this._collection) {
			this._collection =
				this._db.collection<ServiceLogDocument>("service_logs");
			await this.ensureIndexes();
		}
		return this._collection;
	}

	async ensureIndexes(): Promise<void> {
		const col = await this._getCollection();

		if (await this._indexExists("ttl_1")) {
			return;
		}

		await col.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
		await col.createIndex({ "service.name": 1, receivedAt: -1 });
		await col.createIndex({ level: 1, receivedAt: -1 });
		await col.createIndex({ correlationId: 1 });
		await col.createIndex({ receivedAt: -1 });
	}

	async insert(doc: ServiceLogDocument): Promise<void> {
		const col = await this._getCollection();
		await col.insertOne(doc as never);
	}

	async insertBatch(docs: ServiceLogDocument[]): Promise<void> {
		if (docs.length === 0) {
			return;
		}
		const col = await this._getCollection();
		await col.insertMany(docs as never[], { ordered: false });
	}

	async query(params: LogQuery): Promise<{
		docs: ServiceLogDocument[];
		total: number;
		page: number;
		limit: number;
	}> {
		const col = await this._getCollection();
		const filter = this._buildLogFilter(params);

		const page = Math.max(1, params.page ?? 1);
		const limit = Math.min(1000, params.limit ?? 50);
		const skip = (page - 1) * limit;
		const total = await col.countDocuments(filter);
		const docs = await col
			.find(filter)
			.sort({ receivedAt: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return { docs, total, page, limit };
	}

	async getStats(): Promise<LogStats> {
		const col = await this._getCollection();
		const pipeline = this._buildStatsPipeline();
		const [aggResult] = await col.aggregate(pipeline).toArray();
		return this._parseStatsResult(aggResult);
	}

	async getById(id: string): Promise<ServiceLogDocument | null> {
		const col = await this._getCollection();
		const { ObjectId } = await import("mongodb");
		if (!ObjectId.isValid(id)) {
			return null;
		}
		return col.findOne({ [MID]: new ObjectId(id) } as never);
	}

	private _buildLogFilter(params: LogQuery): Record<string, unknown> {
		const filter: Record<string, unknown> = {};

		if (params.serviceName) {
			filter["service.name"] = params.serviceName;
		}
		if (params.level) {
			filter.level = params.level;
		}
		if (params.correlationId) {
			filter.correlationId = params.correlationId;
		}
		if (params.startDate || params.endDate) {
			filter.receivedAt = {} as Record<string, Date>;
			if (params.startDate) {
				(filter.receivedAt as Record<string, Date>)[MGTE] = new Date(
					params.startDate
				);
			}
			if (params.endDate) {
				(filter.receivedAt as Record<string, Date>)[MLTE] = new Date(
					params.endDate
				);
			}
		}
		if (params.search) {
			filter.message = { [MREGEX]: params.search, [MOPTIONS]: "i" };
		}

		return filter;
	}

	private _buildStatsPipeline(): Record<string, unknown>[] {
		return [
			{
				[MFACET]: {
					byService: [
						{ [MGROUP]: { [MID]: "$service.name", count: { [MSUM]: 1 } } },
					],
					byLevel: [{ [MGROUP]: { [MID]: "$level", count: { [MSUM]: 1 } } }],
					dateRange: [
						{
							[MGROUP]: {
								[MID]: null,
								earliest: { [MMIN]: "$receivedAt" },
								latest: { [MMAX]: "$receivedAt" },
							},
						},
					],
					total: [{ [MCOUNT]: "count" }],
				},
			},
		];
	}

	private _parseStatsResult(aggResult: Record<string, unknown>): LogStats {
		const byService: Record<string, number> = {};
		for (const svc of (aggResult?.byService as Array<{
			[MID]: string;
			count: number;
		}>) ?? []) {
			byService[svc[MID]] = svc.count;
		}
		const byLevel: Record<string, number> = {};
		for (const level of (aggResult?.byLevel as Array<{
			[MID]: string;
			count: number;
		}>) ?? []) {
			byLevel[level[MID]] = level.count;
		}
		const dr = (
			aggResult?.dateRange as Array<{ earliest?: Date; latest?: Date }>
		)?.[0];

		return {
			total: (aggResult?.total as Array<{ count: number }>)?.[0]?.count ?? 0,
			byService,
			byLevel,
			dateRange: {
				earliest: dr?.earliest?.toISOString(),
				latest: dr?.latest?.toISOString(),
			},
		};
	}

	private async _indexExists(name: string): Promise<boolean> {
		try {
			const db = this._collection ? this._db : undefined;
			if (!db) {
				return false;
			}
			return await db.collection("service_logs").indexExists(name);
		} catch {
			return false;
		}
	}
}
