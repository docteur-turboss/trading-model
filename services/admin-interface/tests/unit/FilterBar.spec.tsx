import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/components/filter-bar";

describe("FilterBar", () => {
	it("should render search input with placeholder", () => {
		render(<FilterBar searchPlaceholder="Find..." />);
		expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
	});

	it("should render filters children", () => {
		render(<FilterBar filters={<button type="button">ExtraFilter</button>} />);
		expect(screen.getByText("ExtraFilter")).toBeInTheDocument();
	});

	it("should call onSearchChange when typing", () => {
		const onSearchChange = vi.fn();
		render(<FilterBar onSearchChange={onSearchChange} />);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "test" } });
		expect(onSearchChange).toHaveBeenCalledWith("test");
	});

	it("should show Apply button when onApply provided", () => {
		const onApply = vi.fn();
		render(<FilterBar onApply={onApply} />);
		fireEvent.click(screen.getByText("Apply"));
		expect(onApply).toHaveBeenCalled();
	});

	it("should show Reset link when onReset provided", () => {
		const onReset = vi.fn();
		render(<FilterBar onReset={onReset} />);
		fireEvent.click(screen.getByText("Reset"));
		expect(onReset).toHaveBeenCalled();
	});

	it("should render with searchValue", () => {
		render(<FilterBar searchValue="prefilled" />);
		expect(screen.getByDisplayValue("prefilled")).toBeInTheDocument();
	});
});
