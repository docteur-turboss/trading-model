import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/telemetry", () => ({
	reportError: vi.fn(),
	reportMetric: vi.fn(),
}));

import { ErrorBoundary } from "../../src/components/error-boundary";
import { reportError } from "../../src/infrastructure/telemetry";

function Bomb(): never {
	throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
	it("renders children when no error occurs", () => {
		render(
			<ErrorBoundary>
				<div>content</div>
			</ErrorBoundary>
		);

		expect(screen.getByText("content")).toBeTruthy();
		expect(reportError).not.toHaveBeenCalled();
	});

	it("renders the fallback and reports the error when a child throws", () => {
		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(reportError).toHaveBeenCalled();
	});

	it("renders a custom fallback", () => {
		render(
			<ErrorBoundary fallback={<div>custom fallback</div>}>
				<Bomb />
			</ErrorBoundary>
		);

		expect(screen.getByText("custom fallback")).toBeTruthy();
		expect(reportError).toHaveBeenCalled();
	});
});
