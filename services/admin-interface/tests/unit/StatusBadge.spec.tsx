import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../../src/components/status-badge";

describe("StatusBadge", () => {
	it("should render with status text", () => {
		render(<StatusBadge status="healthy" />);
		expect(screen.getByText("healthy")).toBeInTheDocument();
	});

	it("should render custom label when provided", () => {
		render(<StatusBadge status="healthy" label="Active" />);
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("should use success color for healthy status", () => {
		render(<StatusBadge status="healthy" />);
		const chip = screen.getByText("healthy").closest(".MuiChip-root");
		expect(chip).toBeInTheDocument();
	});

	it("should use error color for down status", () => {
		render(<StatusBadge status="down" />);
		const chip = screen.getByText("down").closest(".MuiChip-root");
		expect(chip).toBeInTheDocument();
	});

	it("should use warning color for degraded status", () => {
		render(<StatusBadge status="degraded" />);
		const chip = screen.getByText("degraded").closest(".MuiChip-root");
		expect(chip).toBeInTheDocument();
	});

	it("should handle unknown status gracefully", () => {
		render(<StatusBadge status="unknown" />);
		expect(screen.getByText("unknown")).toBeInTheDocument();
	});

	it("should be case-insensitive for status mapping", () => {
		render(<StatusBadge status="Healthy" />);
		expect(screen.getByText("Healthy")).toBeInTheDocument();
	});
});
