import { NeuralNetwork } from "./neural-network";

export class Agent {
  private brain: NeuralNetwork;
  public fitness: number = 0;

  constructor(
    inputSize: number,
    hiddenSize: number,
    outputSize: number
  ) {
    this.brain = new NeuralNetwork(inputSize, hiddenSize, outputSize);
  }

  /**
   * Prend une observation en entrée et retourne une action
   */
  act(observation: number[]): number[] {
    return this.brain.forward(observation);
  }

  /**
   * Permet de réinitialiser le fitness
   */
  reset(): void {
    this.fitness = 0;
  }

  /**
   * Exemple : incrément du fitness
   */
  addFitness(value: number): void {
    this.fitness += value;
  }

  /**
   * Accès au réseau (optionnel, utile pour évolution génétique)
   */
  getBrain(): NeuralNetwork {
    return this.brain;
  }
}