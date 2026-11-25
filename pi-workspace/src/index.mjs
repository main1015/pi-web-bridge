import { sum, average, clamp } from './math.mjs';

const sample = [12, 18, 25, 31, 14];
console.log('Sample:', sample);
console.log('Sum:', sum(sample));
console.log('Average:', average(sample));
console.log('Clamped(120, 0, 100):', clamp(120, 0, 100));
