/**
 * The transform guard, which decides whether a laid-out element can be redrawn
 * at all. It asks whether the primitives can carry the matrix, not whether the
 * matrix is the identity: three of the ten dynamic forms offset an element by a
 * translation the rects already hold.
 */

import { describe, expect, it } from 'vitest';
import { unrepresentable } from './display-list.js';

describe('a transform the display list can carry', () => {
	it.each([
		['none', 'none'],
		['a translation, which is already in the rect', 'matrix(1, 0, 0, 1, -20.4883, -8.78906)'],
		['LiveCycle xfa-font-horizontal-scale at 104%', 'matrix(1.04, 0, 0, 1, 0, 0)'],
		['the same at 96%', 'matrix(0.96, 0, 0, 1, 0, 0)']
	])('%s', (_, transform) => {
		expect(unrepresentable(transform)).toBe(false);
	});

	it.each([
		['a quarter turn', 'matrix(0, 1, -1, 0, 0, 0)'],
		['a skew', 'matrix(1, 0, 0.176, 1, 0, 0)'],
		['a vertical scale, which a run has no way to carry', 'matrix(1, 0, 0, 1.2, 0, 0)'],
		['a mirror', 'matrix(-1, 0, 0, 1, 0, 0)'],
		['a collapse to nothing', 'matrix(0, 0, 0, 1, 0, 0)'],
		['anything not a 2-D matrix', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)']
	])('%s refuses', (_, transform) => {
		expect(unrepresentable(transform)).toBe(true);
	});
});
