import { AgentError } from "cash-lib/utils/Errors";

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
  private weightsInputHidden: number[][];
  private weightsHiddenOutput: number[][];
  private biasHidden: number[];
  private biasOutput: number[];
  constructor(
    private inputSize: number,
    private hiddenSize: number,
    private outputSize: number,
    private learningRate: number = 0.1
  ) {
    this.weightsInputHidden = this.randomMatrix(this.hiddenSize, this.inputSize);
    this.weightsHiddenOutput = this.randomMatrix(this.outputSize, this.hiddenSize);

    this.biasHidden = this.randomArray(this.hiddenSize);
    this.biasOutput = this.randomArray(this.outputSize);
  }

  /**
   * Generates a matrix filled with random values between -1 and 1.
   *
   * @param rows - Number of rows.
   * @param cols - Number of columns.
   * @returns A 2D array of random numbers.
   */
  private randomMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => Math.random() * 2 - 1)
    );
  }

  /**
   * Generates an array filled with random values between -1 and 1.
   *
   * @param size - Length of the array.
   * @returns An array of random numbers.
   */
  private randomArray(size: number): number[] {
    return Array.from({ length: size }, () => Math.random() * 2 - 1);
  }

  /**
   * Sigmoid activation function.
   *
   * @param x - Input value.
   * @returns Activated value between 0 and 1.
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Derivative of sigmoid function.
   * Uses already-activated value for efficiency.
   */
  private sigmoidDerivative(y: number): number {
    return y * (1 - y);
  }

  /**
   * Computes the dot product between a matrix and a vector.
   *
   * @param matrix - 2D weight matrix.
   * @param vector - Input vector.
   * @returns Resulting vector after multiplication.
   */
  private dot(matrix: number[][], vector: number[]): number[] {
    return matrix.map(row =>
      row.reduce((sum, weight, i) => sum + weight * vector[i], 0)
    );
  }

  /**
   * Performs forward propagation through the network.
   *
   * Steps:
   * 1. Input → Hidden (weighted sum + bias)
   * 2. Apply sigmoid activation to hidden layer
   * 3. Hidden → Output (weighted sum + bias)
   * 4. Apply sigmoid activation to output layer
   *
   * @param input - Input vector. Must match inputSize.
   * @throws {AgentError} If the input vector size does not match inputSize.
   * @returns Output vector after forward propagation.
   */
  public forward(input: number[]): number[] {
    if (input.length !== this.inputSize) {
      throw new AgentError(`Expected input size ${this.inputSize}`);
    }

    const hidden = this.dot(this.weightsInputHidden, input)
      .map((v, i) => this.sigmoid(v + this.biasHidden[i]));

    const output = this.dot(this.weightsHiddenOutput, hidden)
      .map((v, i) => this.sigmoid(v + this.biasOutput[i]));

    return output;
  }

  
  /**
   * Trains the network using backpropagation.
   *
   * @param input - Input vector
   * @param target - Expected output vector
   */
  public train(input: number[], target: number[]): void {
    if (input.length !== this.inputSize) {
      throw new AgentError(`Expected input size ${this.inputSize}`);
    }
    if (target.length !== this.outputSize) {
      throw new AgentError(`Expected target size ${this.outputSize}`);
    }

    const hidden = this.dot(this.weightsInputHidden, input)
      .map((v, i) => this.sigmoid(v + this.biasHidden[i]));
    const output = this.dot(this.weightsHiddenOutput, hidden)
      .map((v, i) => this.sigmoid(v + this.biasOutput[i]));
      
    const outputErrors = output.map((o, i) => target[i] - o);

    const outputGradients = output.map((o, i) =>
      outputErrors[i] * this.sigmoidDerivative(o) * this.learningRate
    );

    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.weightsHiddenOutput[i][j] += outputGradients[i] * hidden[j];
      }
      this.biasOutput[i] += outputGradients[i];
    }

    const hiddenErrors = new Array(this.hiddenSize).fill(0);

    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.outputSize; j++) {
        hiddenErrors[i] += this.weightsHiddenOutput[j][i] * outputErrors[j];
      }
    }

    const hiddenGradients = hidden.map((h, i) =>
      hiddenErrors[i] * this.sigmoidDerivative(h) * this.learningRate
    );

    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.weightsInputHidden[i][j] += hiddenGradients[i] * input[j];
      }
      this.biasHidden[i] += hiddenGradients[i];
    }
  }
}