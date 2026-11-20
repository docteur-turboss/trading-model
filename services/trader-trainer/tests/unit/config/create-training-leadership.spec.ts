import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/contracts/logger-registry", () => ({
	...jest.requireActual<object>("@trading-model/contracts/logger-registry"),
	getLogger: () => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}),
}));

// The container's message bus client reads the environment at import.
jest.mock("../../../src/config/message-manager", () => ({
	MessageManager: {},
}));

const MOCK_LEASE_API = jest.fn<(name: string) => unknown>(() => ({}));
const MOCK_KUBERNETES_LEASE = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/reliability/kubernetes-lease", () => ({
	kubernetesLeaseApi: MOCK_LEASE_API,
	KubernetesLease: MOCK_KUBERNETES_LEASE,
}));

import { createTrainingLeadership } from "../../../src/config/container";

const TRAINING = {
	start: jest.fn<() => void>(),
	stop: jest.fn(async () => {
		// Nothing to end.
	}),
};

describe("createTrainingLeadership (ADR-0058)", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("trains at once without a Lease name (compose, dev)", async () => {
		const leadership = createTrainingLeadership(
			{ TRAINER_LEASE_NAME: "", INSTANCE_ID: "trader-trainer-1" },
			TRAINING
		);
		leadership.start();
		await new Promise((resolve) => setTimeout(resolve, 10));
		await leadership.stop();

		expect(MOCK_LEASE_API).not.toHaveBeenCalled();
		expect(TRAINING.start).toHaveBeenCalledTimes(1);
		expect(TRAINING.stop).toHaveBeenCalledTimes(1);
	});

	it("competes for the named Lease under the pod name", () => {
		createTrainingLeadership(
			{
				TRAINER_LEASE_NAME: "trader-trainer",
				INSTANCE_ID: "trader-trainer-abc",
			},
			TRAINING
		);

		expect(MOCK_LEASE_API).toHaveBeenCalledWith("trader-trainer");
		expect(MOCK_KUBERNETES_LEASE).toHaveBeenCalledWith(
			"trader-trainer-abc",
			expect.anything()
		);
	});
});
