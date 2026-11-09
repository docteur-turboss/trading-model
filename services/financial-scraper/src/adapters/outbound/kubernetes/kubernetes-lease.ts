import { readFileSync } from "node:fs";
import https from "node:https";
import axios from "axios";
import type { LeaderLeasePort } from "../../../domain/ports/leader-lease.port";

/** The fields of a coordination.k8s.io/v1 Lease this adapter reads and writes. */
export interface Lease {
	metadata: { name: string; resourceVersion?: string; [key: string]: unknown };
	spec?: {
		holderIdentity?: string;
		leaseDurationSeconds?: number;
		acquireTime?: string;
		renewTime?: string;
		leaseTransitions?: number;
	};
	[key: string]: unknown;
}

/** Reads and replaces one Lease; `update` resolves "conflict" on HTTP 409. */
export interface LeaseApi {
	get(): Promise<Lease>;
	update(lease: Lease): Promise<Lease | "conflict">;
}

/**
 * How long a holder's last renewal keeps the lease: a candidate takes it only
 * this long after it last saw the Lease change (its own clock, never the
 * holder's, so clock skew does not matter).
 */
export const LEASE_DURATION_SECONDS = 15;

/** Kubernetes MicroTime: RFC 3339 with exactly 6 fractional digits. */
function _microTime(ms: number): string {
	return new Date(ms).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/**
 * Leader lease on a Kubernetes Lease (ADR-0057), the algorithm of client-go's
 * leaderelection: optimistic concurrency on `resourceVersion`, expiry judged
 * from the time this instance observed the last change.
 */
export class KubernetesLease implements LeaderLeasePort {
	private _observedVersion?: string;
	private _observedAt = 0;

	constructor(
		private readonly _identity: string,
		private readonly _api: LeaseApi,
		private readonly _now: () => number = Date.now
	) {}

	async tryAcquireOrRenew(): Promise<boolean> {
		const lease = await this._api.get();
		const now = this._now();
		if (lease.metadata.resourceVersion !== this._observedVersion) {
			this._observedVersion = lease.metadata.resourceVersion;
			this._observedAt = now;
		}
		const spec = lease.spec ?? {};
		const holder = spec.holderIdentity;
		const held = holder === this._identity;
		const duration =
			(spec.leaseDurationSeconds ?? LEASE_DURATION_SECONDS) * 1000;
		if (holder && !held && now < this._observedAt + duration) {
			return false;
		}
		const time = _microTime(now);
		return this._write(lease, {
			holderIdentity: this._identity,
			leaseDurationSeconds: LEASE_DURATION_SECONDS,
			acquireTime: held ? spec.acquireTime : time,
			renewTime: time,
			leaseTransitions: (spec.leaseTransitions ?? 0) + (held ? 0 : 1),
		});
	}

	async release(): Promise<void> {
		const lease = await this._api.get();
		if (lease.spec?.holderIdentity !== this._identity) {
			return;
		}
		// No holder: a candidate takes it on its next try, without waiting for expiry.
		const { holderIdentity: _released, ...spec } = lease.spec;
		await this._write(lease, {
			...spec,
			leaseDurationSeconds: 1,
			renewTime: _microTime(this._now()),
		});
	}

	private async _write(
		lease: Lease,
		spec: NonNullable<Lease["spec"]>
	): Promise<boolean> {
		const updated = await this._api.update({ ...lease, spec });
		if (updated === "conflict") {
			return false;
		}
		this._observedVersion = updated.metadata.resourceVersion;
		this._observedAt = this._now();
		return updated.spec?.holderIdentity === this._identity;
	}
}

const SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

/** Under the 10 s renew deadline of the collector leadership. */
const API_TIMEOUT_MS = 5000;

/**
 * The Lease `name` of the pod's namespace, through the Kubernetes API with the
 * pod's ServiceAccount token (re-read on each call: the kubelet rotates it).
 * Throws at once when the token is not mounted
 * (`automountServiceAccountToken`).
 */
export function kubernetesLeaseApi(name: string): LeaseApi {
	const namespace = readFileSync(
		`${SERVICE_ACCOUNT_DIR}/namespace`,
		"utf8"
	).trim();
	const client = axios.create({
		baseURL: `https://kubernetes.default.svc/apis/coordination.k8s.io/v1/namespaces/${namespace}/leases/${name}`,
		httpsAgent: new https.Agent({
			ca: readFileSync(`${SERVICE_ACCOUNT_DIR}/ca.crt`),
		}),
		timeout: API_TIMEOUT_MS,
	});
	const headers = () => ({
		Authorization: `Bearer ${readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, "utf8").trim()}`,
	});
	return {
		async get() {
			return (await client.get<Lease>("", { headers: headers() })).data;
		},
		async update(lease) {
			const response = await client.put<Lease>("", lease, {
				headers: headers(),
				validateStatus: (status) =>
					status === 409 || (status >= 200 && status < 300),
			});
			return response.status === 409 ? "conflict" : response.data;
		},
	};
}
