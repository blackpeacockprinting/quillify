import { describe, expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { openPdf } from './pdfjs.js';
import { xfaToAcroForm } from './xfa.js';

/** A rectangle from (20, 20) to (220, 60). */
const rectangle = (inner: string) =>
	`<draw x="20pt" y="20pt" w="200pt" h="40pt"><value><rectangle>${inner}</rectangle></value></draw>`;
const line = (y: number, edge: string) =>
	`<draw x="20pt" y="${y}pt" w="200pt" h="0pt"><value><line>${edge}</line></value></draw>`;

/** The color pdf.js paints at a point of the redrawn first page. */
async function redrawn(body: string): Promise<(x: number, y: number) => number[]> {
	const { pdf, close } = await openPdf(await xfaToAcroForm(await dynamicForm(body)));
	try {
		const page = await pdf.getPage(1);
		const viewport = page.getViewport({ scale: 1 });
		const canvas = document.createElement('canvas');
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		await page.render({ canvas, viewport }).promise;
		const context = canvas.getContext('2d')!;
		return (x, y) => [...context.getImageData(x, y, 1, 1).data.subarray(0, 3)];
	} finally {
		await close();
	}
}

const WHITE = [255, 255, 255];
const RED = [255, 0, 0];
const NAVY = [0, 0, 128];
const GRADIENT =
	'<fill><color value="255,255,0"/><linear type="toRight"><color value="0,0,255"/></linear></fill>';

describe('an XFA rectangle, laid out by pdf.js and redrawn', () => {
	it('keeps its fill when its edge is hidden', async () => {
		const at = await redrawn(
			rectangle('<edge presence="hidden"/><fill><color value="0,0,128"/></fill>')
		);
		expect(at(120, 40)).toEqual(NAVY);
		expect(at(300, 40)).toEqual(WHITE);
	});

	it('keeps its fill and its edge when both show', async () => {
		const at = await redrawn(
			rectangle(
				'<edge thickness="6pt"><color value="255,0,0"/></edge><fill><color value="0,0,128"/></fill>'
			)
		);
		expect(at(120, 40)).toEqual(NAVY);
		expect(at(22, 40)).toEqual(RED);
	});

	it('paints nothing when it has neither', async () => {
		const at = await redrawn(rectangle('<edge presence="hidden"/>'));
		expect(at(120, 40)).toEqual(WHITE);
		expect(at(22, 40)).toEqual(WHITE);
	});

	// pdf.js writes a gradient where the browser takes a color. The browser drops it, and the rectangle is black.
	it.each([
		['a hidden edge', '<edge presence="hidden"/>'],
		['an edge that shows', '<edge/>']
	])('refuses the form when its fill is a gradient, with %s', async (_, edge) => {
		await expect(
			xfaToAcroForm(await dynamicForm(rectangle(edge + GRADIENT)))
		).rejects.toMatchObject({
			refusal: { code: 'unpaintable', page: 0, construct: 'background_image' }
		});
	});
});

describe('an XFA line, laid out by pdf.js and redrawn', () => {
	it('is drawn when its edge shows and left out when its edge is hidden', async () => {
		const at = await redrawn(
			line(20, '<edge presence="hidden"/>') +
				line(50, '<edge thickness="2pt"><color value="255,0,0"/></edge>')
		);
		expect(at(120, 20)).toEqual(WHITE);
		expect(at(120, 50)).toEqual(RED);
	});
});
