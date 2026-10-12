import { afterEach, describe, expect, it } from 'vitest';
import { displayList } from './display-list.js';
import { Refused } from './refusal.js';
import type { XfaPage } from './xfa-layer.js';

let host: HTMLDivElement | undefined;

/** A laid-out page holding one inline SVG, the way `XfaLayer.render` emits a drawn shape. */
function page(shape: string): XfaPage {
	host = document.createElement('div');
	host.style.cssText = 'position:absolute;left:0;top:0;width:612px;height:792px';
	host.innerHTML = `<div class="xfaLayer"><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" style="position:absolute;left:20px;top:30px;overflow:visible">${shape}</svg></div>`;
	document.body.append(host);
	return {
		layer: host.firstElementChild as HTMLElement,
		origin: host.getBoundingClientRect(),
		width: 612,
		height: 792
	};
}

afterEach(() => host?.remove());

describe('an inline SVG shape', () => {
	it('draws a rect as a box whose border is centered on the edge of the rect', () => {
		const list = displayList(
			page(
				'<rect x="0" y="0" width="100" height="50" fill="none" stroke="#000" stroke-width="6" />'
			),
			1
		);
		expect(list.boxes).toHaveLength(1);
		expect(list.boxes[0]).toMatchObject({ x: 17, y: 27, w: 106, h: 56 });
	});

	it('draws a rect with no stroke as a box of its own size', () => {
		const list = displayList(
			page('<rect x="0" y="0" width="100" height="50" fill="#ccc" stroke="none" />'),
			1
		);
		expect(list.boxes).toHaveLength(1);
		expect(list.boxes[0]).toMatchObject({ x: 20, y: 30, w: 100, h: 50 });
	});

	it('refuses an ellipse by name, since a box has four corners', () => {
		const laid = page('<ellipse cx="50" cy="25" rx="50" ry="25" fill="none" stroke="#000" />');
		expect(() => displayList(laid, 3)).toThrow(Refused);
		expect(() => displayList(laid, 3)).toThrow(
			expect.objectContaining({
				refusal: { code: 'unpaintable', page: 2, construct: 'svg', detail: 'ellipse' }
			})
		);
	});
});
