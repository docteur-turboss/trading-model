import { AgentError } from "cash-lib/utils/Errors";

type LossFunctionType = "mean-squared-error" | "cross-entropy" | "mean-biais-error" | "mean-absolute-error" | "root-mean-squared-error" | "huber-loss" | "log-cosh-loss" | "binary-cross-entropy" | "hinge-loss" | "Kullback-Leibler-divergence";
type NormalisationType = "min-max" | "z-score" | "decimal-scaling" | "border" | "robust-scaling" | "logarithmic-normalization" | "none";
type ActivationType = "sigmoid" | "tanh" | "ReLu" | "leakyReLu" | "GELU" | "softmax" | "ELU" | "mish";
type ConnectionType = "fully-connected" | "skip-connection" | "residual-connection";
type InitialisationType = "zeros" | "leCun" | "he" | "xavier" | "random";

/**
 * Represents a simple fully-connected feedforward neural network
 * with a single hidden layer.
 *
 * Architecture:
 * Input Layer → Hidden Layer (sigmoid) → Output Layer (sigmoid)
 *
 * Weights and biases are initialized randomly between -1 and 1.
 */
export class NeuralNetwork {
  private activations: number[][] = [];
  private weights: number[][][] = [];
  private bias: number[][] = [];
  
  constructor(
    private neuronsByLayer: number[],
    private deltaHuber: number = 1,
    private learningRate: number = 0.1,
    private activationType: ActivationType = "sigmoid",
    private normalisationType: NormalisationType = "none",
    private initialisationType: InitialisationType = "random",
    private connectionType: ConnectionType = "fully-connected",
    private lossFunctionType: LossFunctionType = "mean-squared-error",
  ) {
    for (let i = 0; i < this.neuronsByLayer.length - 1; i++) {
      if (this.neuronsByLayer[i] <= 0 || this.neuronsByLayer[i + 1] <= 0) throw new AgentError(`Layer sizes must be positive integers`);

      const fanIn = this.neuronsByLayer[i];
      const fanOut = this.neuronsByLayer[i + 1];

      const initWeights = (fanIn: number, fanOut: number): number[][] => {
        switch (this.initialisationType) {
          case "zeros":
            return Array.from({ length: fanOut }, () => Array(fanIn).fill(0));
          case "leCun":
            return Array.from({ length: fanOut }, () => Array.from({ length: fanIn }, () => (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())) * Math.sqrt(1 / fanIn)));
          case "he":
            return Array.from({ length: fanOut }, () => Array.from({ length: fanIn }, () => (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())) * Math.sqrt(2 / fanIn)));
          case "xavier":
            const limit = Math.sqrt(6 / (fanIn + fanOut));
            return Array.from({ length: fanOut }, () => Array.from({ length: fanIn }, () => (Math.random() * 2 - 1) * limit));
          default:
            return Array.from({ length: fanOut }, () => Array.from({ length: fanIn }, () => Math.random() * 2 - 1));
        }
      };

      const initBias = (fanIn: number): number[] => {
        switch (this.initialisationType) {
          case "zeros":
            return Array(fanOut).fill(0);
          case "leCun":
            return Array.from({ length: fanOut }, () => (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())) * Math.sqrt(1 / fanIn));
          case "he":
            return Array.from({ length: fanOut }, () => (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())) * Math.sqrt(2 / fanIn));
          case "xavier":
            const limit = Math.sqrt(6 / (fanIn + fanOut));
            return Array.from({ length: fanOut }, () => (Math.random() * 2 - 1) * limit);
          default:
            return Array.from({ length: fanOut }, () => Math.random() * 2 - 1);
        }
      };

      if (this.connectionType === "skip-connection") {
        // main weights
        this.weights.push(initWeights(fanIn, fanOut));
        this.bias.push(initBias(fanIn));
        // skip weights from input
        const inputSize = this.neuronsByLayer[0];
        this.weights.push(initWeights(inputSize, fanOut));
        this.bias.push(initBias(inputSize));
      } else {
        this.weights.push(initWeights(fanIn, fanOut));
        this.bias.push(initBias(fanIn));
      }
    }
  }

  /**
   * Normalizes the input data based on the specified normalization type.
   * @param input - Array of input values to be normalized.
   * @param params - Optional parameters for certain normalization types (e.g., min and max for border normalization).
   * @returns An array of normalized values.
   */
  private normalize(input: number[], params?: {min: number, max: number}): number[] {
    switch (this.normalisationType) {
      case "min-max": 
        const min = Math.min(...input);
        const max = Math.max(...input);
        
        return input.map(x => (x - min) / (max - min));
      case "z-score":
        const mean = input.reduce((sum, x) => sum + x) / input.length;
        const std = Math.sqrt(input.reduce((sum, x) => sum + Math.pow(x - mean, 2)) / input.length);

        return input.map(x => (x - mean) / std);
      case "decimal-scaling":
        const maxAbs = Math.max(...input.map(x => Math.abs(x)));
        const j = Math.ceil(Math.log10(maxAbs + 1));

        return input.map(x => x / Math.pow(10, j));
      case "border": 
        const borderMin = params?.min ?? Math.min(...input);
        const borderMax = params?.max ?? Math.max(...input);

        return input.map(x => x < borderMin ? borderMin : x > borderMax ? borderMax : x);
      case "robust-scaling":
        let sorted = [...input].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const q1 = sorted[Math.floor(sorted.length / 4)];
        const q3 = sorted[Math.floor(sorted.length * 3 / 4)];
        const iqr = q3 - q1;

        return input.map(x => (x - median) / iqr);
      case "logarithmic-normalization":
        return input.map(x => Math.log(x + 1));
      default:
        return input;
    }
  }

  /**
   * Applies the specified activation function to the input array.
   * @param x - Array of input values to be activated.
   * @returns An array of activated values.
   */
  private activateFonction(x: number[]): number[] {
    switch (this.activationType) {
      case "sigmoid": 
        return x.map((v) => 1 / (1 + Math.exp(-v)));
      case "tanh":
        return x.map((v) => Math.tanh(v));
      case "ReLu": 
        return x.map((v) => Math.max(0, v));
      case "leakyReLu":
        return x.map((v) => v > 0 ? v : 0.01 * v);
      case "GELU":
        return x.map((v) => 0.5 * v * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * Math.pow(v, 3)))));
      case "softmax":
        const exps = x.map((v) => Math.exp(v));
        const sumExps = exps.reduce((sum, v) => sum + v);

        return exps.map((v) => v / sumExps);
      case "ELU":
        return x.map((v) => v >= 0 ? v : 0.01 * (Math.exp(v) - 1));
      case "mish":
        return x.map((v) => v * Math.tanh(Math.log(1 + Math.exp(v))));
      default: 
        return x;
    }
  }

  /**
   * Computes the loss between the output and target values based on the specified loss function type.
   * @param output - Array of output values from the network.
   * @param target - Array of target values to compare against.
   * @returns The computed loss value.
   * @throws {AgentError} If the output and target arrays have different lengths.
   */
  private lossFunction(output: number[], target: number[]): number {
    if (output.length !== target.length) {
      throw new AgentError(`Output and target must have the same length`);
    }

    switch (this.lossFunctionType) {
      case "mean-absolute-error":
        return output.reduce((sum, o, i) => sum + Math.abs(target[i] - o)) / output.length;
      case "root-mean-squared-error":
        return Math.sqrt(output.reduce((sum, o, i) => sum + Math.pow(target[i] - o, 2)) / output.length);
      case "huber-loss":
        const delta = this.deltaHuber ?? 1;

        return output.reduce((sum, o, i) => {
          const error = target[i] - o;
          return sum + (Math.abs(error) <= delta ? 0.5 * Math.pow(error, 2) : delta * (Math.abs(error) - 0.5 * delta));
        }) / output.length;
      case "log-cosh-loss":
        return output.reduce((sum, o, i) => sum + Math.log(Math.cosh(target[i] - o))) / output.length;
      case "Kullback-Leibler-divergence":
        return output.reduce((sum, o, i) => sum + target[i] * Math.log(target[i] / (o + 1e-10))) / output.length;
      case "binary-cross-entropy":
        return output.reduce((sum, o, i) => sum - (target[i] * Math.log(o + 1e-10) + (1 - target[i]) * Math.log(1 - o + 1e-10))) / output.length;
      case "cross-entropy":
        return output.reduce((sum, o, i) => sum - target[i] * Math.log(o + 1e-10)) / output.length;
      case "hinge-loss":
        return output.reduce((sum, o, i) => sum + Math.max(0, 1 - target[i] * o)) / output.length;
      case "mean-biais-error": 
        return output.reduce((sum, o, i) => sum + (target[i] - o)) / output.length;
      default:
        return output.reduce((sum, o, i) => sum + Math.pow(target[i] - o, 2)) / output.length;
    }
  }

  /**
   * Computes the loss for a given input and target output.
   * @param input - Array of input values to be fed into the network.
   * @param target - Array of target output values to compare against.
   * @returns The computed loss value.
   * @throws {AgentError} If the input and target arrays have different lengths than expected by the network.
   */
  public computeLoss(input: number[], target: number[]): number {
    const output = this.forward(input);
    return this.lossFunction(output, target);
  }

  /**
   * Performs forward propagation through the network.
   *
   * Steps:
   * 1. Input → Hidden (weighted sum + bias)
   * 2. Apply activation to hidden layer
   * 3. Hidden → Output (weighted sum + bias)
   * 4. Apply activation to output layer
   *
   * @param input - Input vector. Must match inputSize.
   * @throws {AgentError} If the input vector size does not match inputSize.
   * @returns Output vector after forward propagation.
   */
  public forward(input: number[]): number[] {
    if (input.length !== this.neuronsByLayer[0]) 
      throw new AgentError(`Expected input size ${this.neuronsByLayer[0]}, but got ${input.length}`);
    
    let current = this.normalize(input);
    this.activations = [current];

    for (let i = 0; i < this.neuronsByLayer.length - 1; i++) {
      let weighted: number[];
      if (this.connectionType === "skip-connection") {
        const mainWeighted = this.weights[i * 2].map((row, j) => row.reduce((sum, w, k) => sum + w * current[k], this.bias[i * 2][j]));
        const skipWeighted = this.weights[i * 2 + 1].map((row, j) => row.reduce((sum, w, k) => sum + w * this.activations[0][k], this.bias[i * 2 + 1][j]));
        weighted = mainWeighted.map((v, j) => v + skipWeighted[j]);
      } else {
        weighted = this.weights[i].map((row, j) => row.reduce((sum, w, k) => sum + w * current[k], this.bias[i][j]));
      }

      const activated = this.activateFonction(weighted);
      if (this.connectionType === "residual-connection" && this.neuronsByLayer[i] === this.neuronsByLayer[i + 1]) {
        current = activated.map((v, j) => v + current[j]);
      } else {
        current = activated;
      }
      this.activations.push(current);
    }
    return current;
  }

  /**
   * Derivative of the activation function.
   */
  private activationDerivative(x: number[]): number[] {
    switch (this.activationType) {
      case "sigmoid": 
        return x.map(v => v * (1 - v));
      case "tanh":
        return x.map(v => 1 - v * v);
      case "ReLu": 
        return x.map(v => v > 0 ? 1 : 0);
      case "leakyReLu":
        return x.map(v => v > 0 ? 1 : 0.01);
      case "GELU":
        // Approximate derivative
        return x.map(v => 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * Math.pow(v, 3)))) + 0.5 * v * (1 - Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * Math.pow(v, 3))) ** 2) * Math.sqrt(2 / Math.PI) * (1 + 3 * 0.044715 * Math.pow(v, 2)));
      case "softmax":
        // For softmax, derivative is complex, but for backprop, it's handled in dLoss_dOutput
        return x.map(v => 1);
      case "ELU":
        return x.map(v => v >= 0 ? 1 : 0.01 * Math.exp(v));
      case "mish":
        // Approximate
        return x.map(v => Math.tanh(Math.log(1 + Math.exp(v))) + v * (1 - Math.tanh(Math.log(1 + Math.exp(v))) ** 2) * (Math.exp(v) / (1 + Math.exp(v))));
      default: 
        return x.map(v => 1);
    }
  }

  /**
   * Derivative of loss with respect to output.
   */
  private dLoss_dOutput(output: number[], target: number[]): number[] {
    switch (this.lossFunctionType) {
      case "mean-squared-error":
        return output.map((o, i) => 2 * (o - target[i]) / output.length);
      case "cross-entropy":
        return output.map((o, i) => -target[i] / (o + 1e-10));
      case "mean-absolute-error":
        return output.map((o, i) => o > target[i] ? 1 / output.length : o < target[i] ? -1 / output.length : 0);
      case "root-mean-squared-error":
        const mse = output.reduce((sum, o, i) => sum + Math.pow(o - target[i], 2), 0) / output.length;
        const rmse = Math.sqrt(mse);
        return output.map((o, i) => (o - target[i]) / (output.length * rmse + 1e-10));
      case "huber-loss":
        const delta = this.deltaHuber;
        return output.map((o, i) => {
          const error = o - target[i];
          return Math.abs(error) <= delta ? error / output.length : (error > 0 ? delta : -delta) / output.length;
        });
      case "log-cosh-loss":
        return output.map((o, i) => Math.tanh(target[i] - o) / output.length);
      case "binary-cross-entropy":
        return output.map((o, i) => (-target[i] / (o + 1e-10) + (1 - target[i]) / (1 - o + 1e-10)) / output.length);
      case "hinge-loss":
        return output.map((o, i) => target[i] * o < 1 ? -target[i] / output.length : 0);
      case "Kullback-Leibler-divergence":
        return output.map((o, i) => -target[i] / (o + 1e-10));
      case "mean-biais-error":
        return output.map((o, i) => (o - target[i]) / output.length);
      default:
        return output.map((o, i) => 2 * (o - target[i]) / output.length);
    }
  }

  /**
   * Update weights and bias for a layer.
   */
  private updateLayer(layerIndex: number, delta: number[], input: number[]) {
    for (let j = 0; j < this.weights[layerIndex].length; j++) {
      this.bias[layerIndex][j] -= this.learningRate * delta[j];
      for (let k = 0; k < this.weights[layerIndex][j].length; k++) {
        this.weights[layerIndex][j][k] -= this.learningRate * delta[j] * input[k];
      }
    }
  }

  /**
   * Backpropagation.
   */
  private backprop(target: number[]) {
    const output = this.activations[this.activations.length - 1];
    let delta = this.dLoss_dOutput(output, target);
    delta = delta.map((d, i) => d * this.activationDerivative(output)[i]);

    for (let i = this.neuronsByLayer.length - 2; i >= 0; i--) {
      // update weights and bias for this layer
      if (this.connectionType === "fully-connected") {
        this.updateLayer(i, delta, this.activations[i]);
      } else if (this.connectionType === "skip-connection") {
        this.updateLayer(i * 2, delta, this.activations[i]);
        this.updateLayer(i * 2 + 1, delta, this.activations[0]);
      } else if (this.connectionType === "residual-connection") {
        this.updateLayer(i, delta, this.activations[i]);
      }

      // compute prev_delta
      const prevDelta = Array(this.neuronsByLayer[i]).fill(0);
      if (this.connectionType === "fully-connected") {
        for (let j = 0; j < this.weights[i].length; j++) {
          for (let k = 0; k < this.weights[i][j].length; k++) {
            prevDelta[k] += delta[j] * this.weights[i][j][k];
          }
        }
      } else if (this.connectionType === "skip-connection") {
        for (let j = 0; j < this.weights[i * 2].length; j++) {
          for (let k = 0; k < this.weights[i * 2][j].length; k++) {
            prevDelta[k] += delta[j] * this.weights[i * 2][j][k];
          }
        }
      } else if (this.connectionType === "residual-connection") {
        for (let j = 0; j < this.weights[i].length; j++) {
          for (let k = 0; k < this.weights[i][j].length; k++) {
            prevDelta[k] += delta[j] * this.weights[i][j][k];
          }
        }
        if (this.neuronsByLayer[i] === this.neuronsByLayer[i + 1]) {
          prevDelta.forEach((_, k) => prevDelta[k] += delta[k]);
        }
      }
      delta = prevDelta.map((d, k) => d * this.activationDerivative(this.activations[i])[k]);
    }
  }

  /**
   * Train the network with one sample.
   */
  public train(input: number[], target: number[]) {
    this.forward(input);
    this.backprop(target);
  }
}