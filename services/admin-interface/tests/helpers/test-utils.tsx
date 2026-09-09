import { ThemeProvider } from "@mui/material/styles";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { THEME } from "../../src/shared/theme";

function AllProviders({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider theme={THEME}>
			<MemoryRouter>{children}</MemoryRouter>
		</ThemeProvider>
	);
}

function customRender(
	ui: ReactElement,
	options?: Omit<RenderOptions, "wrapper">
) {
	return render(ui, { wrapper: AllProviders, ...options });
}

export type { RenderOptions };
export { customRender as render };
