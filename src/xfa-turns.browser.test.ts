/**
 * A quarter turn in a dynamic form. The test that sets a redraw beside its
 * layout leaves text out, so the turned text is held here: each run of the
 * redraw lies where the layout has its text, and reads the same way.
 */

import { expect, it } from 'vitest';
import { dynamicFlow, dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';
import { normalizePdf } from './normalize.js';
import { openPdf } from './pdfjs.js';
import { XfaStage } from './xfa-layer.js';
import { xfaToAcroForm } from './xfa.js';

const caption = (rotate: number, x: number, y: number, text: string) =>
	`<draw x="${x}pt" y="${y}pt" w="120pt" h="30pt" rotate="${rotate}"><value><text>${text}</text></value></draw>`;
const FIELD = '<field name="a" x="20pt" y="20pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>';

/** Where a line of text starts and ends on its page, in points from the top left. */
interface Reach {
	from: [number, number];
	to: [number, number];
}

/** The box of each text node of the layout's first page, by its text. */
async function laidOut(bytes: Uint8Array): Promise<Map<string, DOMRect>> {
	const stage = new XfaStage();
	let opened: Awaited<ReturnType<typeof openPdf>> | undefined;
	try {
		opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready });
		const { layer, origin } = await stage.lay(await opened.pdf.getPage(1));
		const boxes = new Map<string, DOMRect>();
		const walker = layer.ownerDocument.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
		const range = layer.ownerDocument.createRange();
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			range.selectNodeContents(node);
			const { x, y, width, height } = range.getBoundingClientRect();
			boxes.set(node.nodeValue!, new DOMRect(x - origin.x, y - origin.y, width, height));
		}
		return boxes;
	} finally {
		stage.close();
		await opened?.close();
	}
}

/** The baseline of each run of the redraw's first page, by its text. */
async function redrawn(bytes: Uint8Array): Promise<Map<string, Reach>> {
	const { pdf, close } = await openPdf(bytes);
	try {
		const page = await pdf.getPage(1);
		const { height } = page.getViewport({ scale: 1 });
		const runs = new Map<string, Reach>();
		for (const item of (await page.getTextContent()).items) {
			if (!('transform' in item)) continue;
			const [a, b, , , e, f] = item.transform;
			const size = Math.hypot(a, b);
			runs.set(item.str, {
				from: [e, height - f],
				to: [e + (item.width * a) / size, height - f - (item.width * b) / size]
			});
		}
		return runs;
	} finally {
		await close();
	}
}

it('draws a turned caption where the layout has it, reading the way the layout reads', async () => {
	const bytes = await normalizePdf(
		await dynamicForm(
			caption(0, 40, 40, 'Upright') +
				caption(90, 100, 300, 'Turned once') +
				caption(180, 400, 100, 'Turned twice') +
				caption(270, 300, 400, 'Turned three times') +
				FIELD
		)
	);
	const layout = await laidOut(bytes);
	const redraw = await redrawn(await xfaToAcroForm(bytes));

	// Which end of the layout's box the text starts from, along x and along y:
	// 0 is the left or the top, 1 the right or the bottom, null either.
	const starts: [string, number | null, number | null][] = [
		['Upright', 0, null],
		['Turned once', null, 1],
		['Turned twice', 1, null],
		['Turned three times', null, 0]
	];
	for (const [text, alongX, alongY] of starts) {
		const box = layout.get(text)!;
		const { from, to } = redraw.get(text)!;
		const [long, at, end] =
			alongX === null
				? [box.height, from[1] - box.y, to[1] - box.y]
				: [box.width, from[0] - box.x, to[0] - box.x];
		const start = (alongX ?? alongY)! * long;
		expect(Math.abs(at - start), `${text}: where it starts`).toBeLessThan(1);
		// drawRuns leaves a run that is within 3% of its measured width as it is.
		expect(Math.abs(end - (long - start)), `${text}: where it ends`).toBeLessThan(1 + 0.03 * long);
		// The baseline lies inside the box the other way.
		const [across, low, high] =
			alongX === null ? [from[0], box.left, box.right] : [from[1], box.top, box.bottom];
		expect(across, `${text}: its baseline`).toBeGreaterThan(low);
		expect(across, `${text}: its baseline`).toBeLessThan(high);
	}
}, 120_000);

const PNG = () => {
	const canvas = document.createElement('canvas');
	return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
};
it.each([
	[
		'a turned field',
		() =>
			dynamicForm(
				'<field name="a" x="100pt" y="300pt" w="200pt" h="20pt" rotate="90"><ui><textEdit/></ui></field>'
			)
	],
	[
		'a turned picture',
		() =>
			dynamicForm(
				`<draw x="100pt" y="300pt" w="120pt" h="30pt" rotate="90"><value><image contentType="image/png">${PNG()}</image></value></draw>${FIELD}`
			)
	],
	[
		'a turned line',
		() =>
			dynamicForm(
				`<draw x="100pt" y="300pt" w="120pt" h="30pt" rotate="90"><value><line/></value></draw>${FIELD}`
			)
	],
	[
		'a caption turned in a column that flows it',
		() =>
			dynamicFlow(
				`<subform layout="tb" w="612pt"><draw w="120pt" h="30pt" rotate="90"><value><text>Sample</text></value></draw>${FIELD}</subform>`
			)
	]
])(
	'refuses a dynamic form with %s as a transform',
	async (_, form) => {
		expect(await sanitize(await form())).toEqual({
			ok: false,
			refusal: { code: 'unpaintable', page: 0, construct: 'transform' }
		});
	},
	120_000
);
