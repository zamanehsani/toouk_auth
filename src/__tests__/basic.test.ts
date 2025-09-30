// import { describe, test, expect } from '@jest/globals';

// Simple test to verify Jest setup
describe('Basic Test Setup', () => {
  test('should pass basic test', () => {
    console.log('Running basic test...');
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    console.log('Running async test...');
    expect(result).toBe('test');
  });
});
