/**
 * `toTopLeftRect` on a turned page, and on a rect written from its other
 * corners. The inventory refuses a page that is still turned once qpdf has
 * flattened what it can, so the library itself asks for no turn: the turns are
 * what `rotation.browser.test.ts` measures a flattened page against. The view
 * is off the origin, so each turn has to measure from its own corner.
 */

import { expect, it } from 'vitest';
import { toTopLeftRect } from './coords.js';

const RECT: [number, number, number, number] = [100, 700, 300, 720];
const VIEW: [number, number, number, number] = [50, 40, 562, 752];

it.each([
	[90, { x: 660, y: 50, w: 20, h: 200 }],
	[180, { x: 262, y: 660, w: 200, h: 20 }],
	[270, { x: 32, y: 262, w: 20, h: 200 }]
])(
	'measures a page turned %i degrees from the corner that turn puts at the top left',
	(turn, rect) => {
		expect(toTopLeftRect(RECT, VIEW, turn)).toEqual(rect);
	}
);

it('reads a turn the other way, or past a full circle, as the turn it comes to', () => {
	expect(toTopLeftRect(RECT, VIEW, -90)).toEqual(toTopLeftRect(RECT, VIEW, 270));
	expect(toTopLeftRect(RECT, VIEW, 450)).toEqual(toTopLeftRect(RECT, VIEW, 90));
});

it('reads a rect written from its right edge to its left as the same box', () => {
	expect(toTopLeftRect([300, 700, 100, 720], VIEW, 0)).toEqual(toTopLeftRect(RECT, VIEW, 0));
});
