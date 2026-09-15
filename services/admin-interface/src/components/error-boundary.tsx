import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../infrastructure/telemetry";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		reportError(error, info);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return (
				this.props.fallback ?? (
					<div role="alert">
						Something went wrong while rendering this view.
					</div>
				)
			);
		}
		return this.props.children;
	}
}
