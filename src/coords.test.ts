import { describe, expect, it } from 'vitest';
import { toTopLeftRect } from './coords.js';

describe('toTopLeftRect', () => {
	it('flips y against the page height on an unrotated page', () => {
		expect(toTopLeftRect([100, 700, 300, 720], [0, 0, 612, 792], 0)).toEqual({
			x: 100,
			y: 72,
			w: 200,
			h: 20
		});
	});

	it('measures from the CropBox corner, not the MediaBox', () => {
		expect(toTopLeftRect([100, 700, 300, 720], [50, 40, 562, 752], 0)).toEqual({
			x: 50,
			y: 32,
			w: 200,
			h: 20
		});
	});

	it('swaps axes on a page rotated 90 degrees', () => {
		expect(toTopLeftRect([100, 700, 300, 720], [0, 0, 612, 792], 90)).toEqual({
			x: 700,
			y: 100,
			w: 20,
			h: 200
		});
	});
});
