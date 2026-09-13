import { fireEvent, render, screen } from "@testing-library/react";
import { JobPriority } from "@trading-model/validation/adapters/inbound/admin";
import { describe, expect, it, vi } from "vitest";
import { JobDetailDrawer, PriorityChip } from "../../src/pages/jobs-detail";

const JOB_DETAIL = {
	timeline: [
		{
			event: "created",
			timestamp: "2024-05-20T14:30:05.000Z",
			description: "Job submitted",
			active: true,
		},
		{
			event: "completed",
			timestamp: "2024-05-20T15:00:00.000Z",
			description: "Job finished",
		},
	],
	payload: { model: "v1", epochs: 10 },
	logs: ["[INFO] started", "[INFO] done"],
};

function renderDrawer(selectedJobId: string | null = "JOB-1") {
	return render(
		<JobDetailDrawer
			selectedJobId={selectedJobId}
			jobDetail={selectedJobId ? JOB_DETAIL : null}
			onClose={vi.fn()}
		/>
	);
}

describe("JobDetailDrawer", () => {
	it("should render header and timeline tab by default", () => {
		renderDrawer();

		expect(screen.getByText(/Job Details - JOB-1/)).toBeInTheDocument();
		expect(screen.getByText("Timeline")).toBeInTheDocument();
		expect(screen.getByText("Payload")).toBeInTheDocument();
		expect(screen.getByText("Logs")).toBeInTheDocument();
		expect(screen.getByText("Job submitted")).toBeInTheDocument();
		expect(screen.getByText("Job finished")).toBeInTheDocument();
		expect(screen.getByText("Restart Job")).toBeInTheDocument();
		expect(screen.getByText("Cancel Job")).toBeInTheDocument();
	});

	it("should switch to the payload tab and render formatted JSON", () => {
		renderDrawer();

		fireEvent.click(screen.getByText("Payload"));
		expect(screen.getByText(/"model"/)).toBeInTheDocument();
		expect(screen.getByText(/"epochs"/)).toBeInTheDocument();
	});

	it("should switch to the logs tab and render each log line", () => {
		renderDrawer();

		fireEvent.click(screen.getByText("Logs"));
		expect(screen.getByText("[INFO] started")).toBeInTheDocument();
		expect(screen.getByText("[INFO] done")).toBeInTheDocument();
	});

	it("should render no tabs when no job detail is selected", () => {
		renderDrawer(null);

		expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
		expect(screen.queryByText("Restart Job")).not.toBeInTheDocument();
	});
});

describe("PriorityChip", () => {
	it("should label each priority", () => {
		const { rerender } = render(
			<PriorityChip priority={JobPriority.HIGHEST} />
		);
		expect(screen.getByText("Critical")).toBeInTheDocument();

		rerender(<PriorityChip priority={JobPriority.HIGH} />);
		expect(screen.getByText("High")).toBeInTheDocument();

		rerender(<PriorityChip priority={JobPriority.MEDIUM} />);
		expect(screen.getByText("Medium")).toBeInTheDocument();

		rerender(<PriorityChip priority={JobPriority.LOW} />);
		expect(screen.getByText("Low")).toBeInTheDocument();

		rerender(<PriorityChip priority={JobPriority.LOWEST} />);
		expect(screen.getByText("Lowest")).toBeInTheDocument();
	});
});
