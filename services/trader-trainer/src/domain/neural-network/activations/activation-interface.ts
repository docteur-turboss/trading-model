export interface ActivationDefinition {
	fn(input: number): number;
	derivative(activation: number, preActivation: number): number;
}
