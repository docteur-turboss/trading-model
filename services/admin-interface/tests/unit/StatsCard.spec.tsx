import StorageIcon from "@mui/icons-material/Storage";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsCard } from "../../src/components/stats-card";

describe("StatsCard", () => {
	it("should render value and label", () => {
		render(<StatsCard icon={<StorageIcon />} value="94.2%" label="HIT RATE" />);
		expect(screen.getByText("94.2%")).toBeInTheDocument();
		expect(screen.getByText("HIT RATE")).toBeInTheDocument();
	});

	it("should render delta when provided", () => {
		render(
			<StatsCard
				icon={<StorageIcon />}
				value="1.2M"
				label="ACTIVE ENTRIES"
				delta="+5% increase today"
				deltaColor="warning.main"
			/>
		);
		expect(screen.getByText("1.2M")).toBeInTheDocument();
		expect(screen.getByText("+5% increase today")).toBeInTheDocument();
	});

	it("should not render delta when not provided", () => {
		render(<StatsCard icon={<StorageIcon />} value="42" label="WORKERS" />);
		expect(screen.getByText("42")).toBeInTheDocument();
		expect(screen.queryByText("delta")).not.toBeInTheDocument();
	});
});
