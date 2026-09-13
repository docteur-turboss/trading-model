import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalConfirm } from "../../src/components/modal-confirm";

function renderModal(
	overrides: Partial<Parameters<typeof ModalConfirm>[0]> = {}
) {
	return render(
		<ModalConfirm
			open
			title="Delete entry?"
			description="This action is irreversible."
			onConfirm={vi.fn()}
			onCancel={vi.fn()}
			{...overrides}
		/>
	);
}

describe("ModalConfirm", () => {
	it("should render title, description and default confirm/cancel buttons", () => {
		renderModal();

		expect(screen.getByText("Delete entry?")).toBeInTheDocument();
		expect(
			screen.getByText("This action is irreversible.")
		).toBeInTheDocument();
		expect(screen.getByText("Confirm")).toBeInTheDocument();
		expect(screen.getByText("Cancel")).toBeInTheDocument();
		expect(screen.queryByText("Expected Impact:")).not.toBeInTheDocument();
	});

	it("should render impact list when impactItems are provided", () => {
		renderModal({ impactItems: ["cache:k1", "cache:k2"] });

		expect(screen.getByText("Expected Impact:")).toBeInTheDocument();
		expect(screen.getByText("cache:k1")).toBeInTheDocument();
		expect(screen.getByText("cache:k2")).toBeInTheDocument();
	});

	it("should call onConfirm with custom label and color", () => {
		const onConfirm = vi.fn();
		renderModal({
			confirmLabel: "Yes, purge",
			confirmColor: "warning",
			onConfirm,
		});

		fireEvent.click(screen.getByText("Yes, purge"));
		expect(onConfirm).toHaveBeenCalled();
	});

	it("should call onCancel when cancel or close icon is clicked", () => {
		const onCancel = vi.fn();
		renderModal({ onCancel });

		fireEvent.click(screen.getByText("Cancel"));
		expect(onCancel).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByTestId("CloseIcon"));
		expect(onCancel).toHaveBeenCalledTimes(2);
	});

	it("should render extraContent when provided", () => {
		renderModal({ extraContent: <div>Extra block</div> });

		expect(screen.getByText("Extra block")).toBeInTheDocument();
	});
});
