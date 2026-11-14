import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_READ_FILE = jest.fn<(...args: any[]) => any>();
jest.mock("node:fs", () => ({ readFileSync: MOCK_READ_FILE }));

const MOCK_GET = jest.fn<(...args: any[]) => any>();
const MOCK_PUT = jest.fn<(...args: any[]) => any>();
const MOCK_CREATE = jest.fn<(...args: any[]) => any>(() => ({
	get: MOCK_GET,
	put: MOCK_PUT,
}));
jest.mock("axios", () => ({
	__esModule: true,
	default: { create: MOCK_CREATE },
}));

import {
	KubernetesLease,
	kubernetesLeaseApi,
	type Lease,
} from "../../src/kubernetes-lease";

function api(lease: Lease) {
	return {
		get: jest.fn(async () => lease),
		update: jest.fn<(l: Lease) => Promise<Lease | "conflict">>(async (l) => ({
			...l,
			metadata: { ...l.metadata, resourceVersion: "next" },
		})),
	};
}

const T0 = Date.UTC(2026, 10, 8, 12, 0, 0, 123);

describe("KubernetesLease", () => {
	it("takes a lease nobody holds, in MicroTime, counting the transition", async () => {
		const leaseApi = api({ metadata: { name: "c", resourceVersion: "1" } });
		const lease = new KubernetesLease("pod-a", leaseApi, () => T0);

		await expect(lease.tryAcquireOrRenew()).resolves.toBe(true);

		expect(leaseApi.update.mock.calls[0][0]).toEqual({
			metadata: { name: "c", resourceVersion: "1" },
			spec: {
				holderIdentity: "pod-a",
				leaseDurationSeconds: 15,
				acquireTime: "2026-11-08T12:00:00.123000Z",
				renewTime: "2026-11-08T12:00:00.123000Z",
				leaseTransitions: 1,
			},
		});
	});

	it("renews its own lease, keeping acquireTime and the transition count", async () => {
		const leaseApi = api({
			metadata: { name: "c", resourceVersion: "7" },
			spec: {
				holderIdentity: "pod-a",
				leaseDurationSeconds: 15,
				acquireTime: "then",
				leaseTransitions: 4,
			},
		});
		const lease = new KubernetesLease("pod-a", leaseApi, () => T0);

		await expect(lease.tryAcquireOrRenew()).resolves.toBe(true);
		expect(leaseApi.update.mock.calls[0][0].spec).toMatchObject({
			acquireTime: "then",
			leaseTransitions: 4,
		});
	});

	it("leaves a lease another instance renewed, until it expires by its own clock", async () => {
		let now = T0;
		const leaseApi = api({
			metadata: { name: "c", resourceVersion: "3" },
			// renewTime far in the past by this clock: skew must not matter.
			spec: {
				holderIdentity: "pod-b",
				leaseDurationSeconds: 15,
				renewTime: "2000-01-01T00:00:00.000000Z",
			},
		});
		const lease = new KubernetesLease("pod-a", leaseApi, () => now);

		await expect(lease.tryAcquireOrRenew()).resolves.toBe(false);
		now += 14_999;
		await expect(lease.tryAcquireOrRenew()).resolves.toBe(false);
		now += 1;
		await expect(lease.tryAcquireOrRenew()).resolves.toBe(true);
		expect(leaseApi.update).toHaveBeenCalledTimes(1);
	});

	it("loses a concurrent update (409)", async () => {
		const leaseApi = api({ metadata: { name: "c", resourceVersion: "1" } });
		leaseApi.update.mockResolvedValue("conflict");
		const lease = new KubernetesLease("pod-a", leaseApi, () => T0);

		await expect(lease.tryAcquireOrRenew()).resolves.toBe(false);
	});

	it("release clears the holder so a successor takes it at once", async () => {
		const leaseApi = api({
			metadata: { name: "c", resourceVersion: "1" },
			spec: {
				holderIdentity: "pod-a",
				leaseDurationSeconds: 15,
				leaseTransitions: 2,
			},
		});
		await new KubernetesLease("pod-a", leaseApi, () => T0).release();

		expect(leaseApi.update.mock.calls[0][0].spec).toEqual({
			leaseDurationSeconds: 1,
			leaseTransitions: 2,
			renewTime: "2026-11-08T12:00:00.123000Z",
		});
	});

	it("release leaves a lease held by another instance untouched", async () => {
		const leaseApi = api({
			metadata: { name: "c", resourceVersion: "1" },
			spec: { holderIdentity: "pod-b" },
		});
		await new KubernetesLease("pod-a", leaseApi).release();
		expect(leaseApi.update).not.toHaveBeenCalled();
	});
});

describe("kubernetesLeaseApi", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_READ_FILE.mockImplementation((path: string) =>
			path.endsWith("namespace")
				? "trading-model\n"
				: path.endsWith("token")
					? "tok\n"
					: "CA"
		);
	});

	it("targets the Lease of the pod namespace with the mounted token and CA", async () => {
		MOCK_GET.mockResolvedValue({ data: { metadata: { name: "c" } } });
		const leaseApi = kubernetesLeaseApi("financial-scraper-collector");

		await expect(leaseApi.get()).resolves.toEqual({ metadata: { name: "c" } });
		expect(MOCK_CREATE.mock.calls[0][0]).toMatchObject({
			baseURL:
				"https://kubernetes.default.svc/apis/coordination.k8s.io/v1/namespaces/trading-model/leases/financial-scraper-collector",
		});
		expect(MOCK_GET.mock.calls[0][1]).toEqual({
			headers: { Authorization: "Bearer tok" },
		});
	});

	it("update returns the stored Lease, or conflict on 409", async () => {
		const leaseApi = kubernetesLeaseApi("c");
		const lease = { metadata: { name: "c" } };
		MOCK_PUT.mockResolvedValueOnce({ status: 200, data: lease });
		await expect(leaseApi.update(lease)).resolves.toBe(lease);
		MOCK_PUT.mockResolvedValueOnce({ status: 409, data: {} });
		await expect(leaseApi.update(lease)).resolves.toBe("conflict");

		const { validateStatus } = MOCK_PUT.mock.calls[0][2];
		expect([200, 409, 403, 500].map(validateStatus)).toEqual([
			true,
			true,
			false,
			false,
		]);
	});
});
