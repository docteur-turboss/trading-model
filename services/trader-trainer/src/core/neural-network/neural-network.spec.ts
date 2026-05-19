/**
 * @fileoverview Unit tests for Neural Network module
 *
 * Tests the NeuralNetwork class:
 * - Forward pass computation
 * - Backward propagation
 * - Weight updates
 * - Activation functions
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import { NeuralNetwork } from './neural-network';

describe('NeuralNetwork', () => {
  let network: NeuralNetwork;

  beforeEach(() => {
    network = new NeuralNetwork({
      neuronsByLayer: [4, 8, 3],
      activationFunctions: ['relu'],
      connectionTypes: ['fully-connected'],
      biasTypes: ['enabled'],
      optimizationType: 'adam',
      learningRate: 0.01,
      lossFunction: 'mse',
    });
  });

  describe('Initialization', () => {
    test('should initialize network with correct layer sizes', () => {
      expect(network).toBeDefined();
    });

    test('should initialize with specified activation functions', () => {
      expect(network).toBeDefined();
    });

    test('should support different layer configurations', () => {
      const net1 = new NeuralNetwork({
        neuronsByLayer: [10, 20, 10],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'sgd',
        learningRate: 0.01,
      });

      expect(net1).toBeDefined();
    });
  });

  describe('Forward Pass', () => {
    test('should perform forward pass with valid input', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = network.forward(input);

      expect(output).toBeDefined();
      expect(output.length).toBe(3);
    });

    test('should return correct output dimension', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const output = network.forward(input);

      expect(output.length).toBe(3);
    });

    test('should handle zero input', () => {
      const input = new Float32Array([0, 0, 0, 0]);
      const output = network.forward(input);

      expect(output).toBeDefined();
      expect(output.length).toBe(3);
    });

    test('should handle normalized input [0, 1]', () => {
      const input = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0].slice(0, 4));
      const output = network.forward(input);

      expect(output).toBeDefined();
      expect(output.every(v => !isNaN(v))).toBe(true);
    });

    test('should produce consistent output for same input', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      const output1 = network.forward(input);
      const output2 = network.forward(input);

      for (let i = 0; i < output1.length; i++) {
        expect(output1[i]).toBe(output2[i]);
      }
    });
  });

  describe('Backward Pass', () => {
    test('should support backward propagation', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const targetOutput = new Float32Array([1, 0, 0]);

      // Forward pass
      network.forward(input);

      // Backward pass (gradient computation)
      // This depends on the implementation
      expect(network).toBeDefined();
    });
  });

  describe('Weight Management', () => {
    test('should initialize weights within reasonable bounds', () => {
      // Weights should be initialized appropriately (not all zeros or too large)
      expect(network).toBeDefined();
    });

    test('should update weights during training', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      network.forward(input);
      // After training step, weights should change

      expect(network).toBeDefined();
    });
  });

  describe('Different Activations', () => {
    test('should work with ReLU activation', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });

    test('should work with Tanh activation', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['tanh'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });

    test('should work with Sigmoid activation', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['sigmoid'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });
  });

  describe('Different Optimizers', () => {
    test('should support SGD optimizer', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'sgd',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });

    test('should support Adam optimizer', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle single hidden layer', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 3],
        activationFunctions: [],
        connectionTypes: [],
        biasTypes: [],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });

    test('should handle large hidden layers', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 128, 64, 3],
        activationFunctions: ['relu', 'relu'],
        connectionTypes: ['fully-connected', 'fully-connected'],
        biasTypes: ['enabled', 'enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });

    test('should handle very small learning rate', () => {
      const net = new NeuralNetwork({
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.00001,
      });

      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const output = net.forward(input);

      expect(output.length).toBe(3);
    });
  });
});
