/**
 * Basic arithmetic utilities for the Pi sandbox.
 */
export function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

export function average(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  return sum(numbers) / numbers.length;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
