import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DrawerPanel } from "../../src/components/drawer-panel";

describe("DrawerPanel", () => {
	it("should render title and close button when open", () => {
		const onClose = vi.fn();
		render(<DrawerPanel open title="Test Title" onClose={onClose} />);
		expect(screen.getByText("Test Title")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("CloseIcon"));
		expect(onClose).toHaveBeenCalled();
	});

	it("should not render content when closed", () => {
		const onClose = vi.fn();
		render(<DrawerPanel open={false} title="Hidden" onClose={onClose} />);
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
	});

	it("should render subtitle when provided", () => {
		render(
			<DrawerPanel
				open
				title="Title"
				subtitle="Subtitle text"
				onClose={vi.fn()}
			/>
		);
		expect(screen.getByText("Subtitle text")).toBeInTheDocument();
	});

	it("should render tabs when provided", () => {
		render(
			<DrawerPanel
				open
				title="With Tabs"
				onClose={vi.fn()}
				tabs={[
					{ label: "Tab A", content: "Content A" },
					{ label: "Tab B", content: "Content B" },
				]}
			/>
		);
		expect(screen.getByText("Tab A")).toBeInTheDocument();
		expect(screen.getByText("Tab B")).toBeInTheDocument();
		expect(screen.getByText("Content A")).toBeInTheDocument();
	});

	it("should switch tab content on tab click when controlled", () => {
		function ControlledDrawer() {
			const [tab, setTab] = React.useState(0);
			return (
				<DrawerPanel
					open
					title="Switchable"
					onClose={vi.fn()}
					activeTab={tab}
					onTabChange={(v) => setTab(v)}
					tabs={[
						{ label: "First", content: "First content" },
						{ label: "Second", content: "Second content" },
					]}
				/>
			);
		}
		render(<ControlledDrawer />);
		expect(screen.getByText("First content")).toBeInTheDocument();
		expect(screen.queryByText("Second content")).not.toBeInTheDocument();
		fireEvent.click(screen.getByText("Second"));
		expect(screen.getByText("Second content")).toBeInTheDocument();
		expect(screen.queryByText("First content")).not.toBeInTheDocument();
	});

	it("should call onTabChange when tab switched", () => {
		const onTabChange = vi.fn();
		render(
			<DrawerPanel
				open
				title="Tabs"
				onClose={vi.fn()}
				tabs={[
					{ label: "One", content: "One" },
					{ label: "Two", content: "Two" },
				]}
				onTabChange={onTabChange}
			/>
		);
		fireEvent.click(screen.getByText("Two"));
		expect(onTabChange).toHaveBeenCalledWith(1);
	});

	it("should render actions when provided", () => {
		render(
			<DrawerPanel
				open
				title="Actions"
				onClose={vi.fn()}
				actions={<button type="button">Save</button>}
			/>
		);
		expect(screen.getByText("Save")).toBeInTheDocument();
	});

	it("should render active tab content based on activeTab prop", () => {
		render(
			<DrawerPanel
				open
				title="Controlled Tab"
				onClose={vi.fn()}
				activeTab={1}
				tabs={[
					{ label: "Zero", content: "Zero content" },
					{ label: "One", content: "One content" },
				]}
			/>
		);
		expect(screen.getByText("One content")).toBeInTheDocument();
		expect(screen.queryByText("Zero content")).not.toBeInTheDocument();
	});
});
