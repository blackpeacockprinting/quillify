import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { displayList } from './display-list.js';
import { openPdf } from './pdfjs.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';

const PAGE_HEIGHT = 792;

/** A one-page dynamic form that prints `text` in a box 200 pt wide. */
const printed = (text: string) =>
	dynamicForm(
		`<draw x="20pt" y="20pt" w="200pt" h="60pt"><value><text>${text}</text></value></draw>`
	);

/** The text pdf.js reads off the redrawn page: each piece, where it starts and its baseline from the page top. */
async function redrawn(bytes: Uint8Array): Promise<[string, number, number][]> {
	const { pdf, close } = await openPdf(await xfaToAcroForm(bytes));
	try {
		const { items } = await (await pdf.getPage(1)).getTextContent();
		return items.flatMap((item) =>
			'str' in item && item.str.trim()
				? [[item.str.trim(), item.transform[4], PAGE_HEIGHT - item.transform[5]]]
				: []
		);
	} finally {
		await close();
	}
}

/**
 * The page laid out as the conversion lays it out: the runs the display list
 * reads, and where the layout has each stretch of text between tabs. A Range
 * over a stretch answers with a box for each line the stretch is on, and one
 * more for a space that hangs at a line's end.
 */
async function laidOut(bytes: Uint8Array) {
	const stage = new XfaStage();
	const opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready });
	try {
		const laid = await stage.lay(await opened.pdf.getPage(1));
		const owner = laid.layer.ownerDocument;
		const walker = owner.createTreeWalker(laid.layer, NodeFilter.SHOW_TEXT);
		const range = owner.createRange();
		const placed: { x: number; width: number; top: number; bottom: number }[] = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			let from = 0;
			for (const stretch of node.nodeValue!.split('\t')) {
				range.setStart(node, from);
				range.setEnd(node, from + stretch.length);
				from += stretch.length + 1;
				if (!stretch.trim()) continue;
				const lines: { top: number; bottom: number; left: number; right: number }[] = [];
				for (const { top, bottom, left, right } of range.getClientRects()) {
					const line = lines.find((known) => known.top === top);
					if (!line) lines.push({ top, bottom, left, right });
					else {
						line.left = Math.min(line.left, left);
						line.right = Math.max(line.right, right);
					}
				}
				for (const { top, bottom, left, right } of lines)
					placed.push({
						x: +(left - laid.origin.left).toFixed(2),
						width: +(right - left).toFixed(2),
						top: top - laid.origin.top,
						bottom: bottom - laid.origin.top
					});
			}
		}
		return { placed, runs: displayList(laid, 1).runs };
	} finally {
		stage.close();
		await opened.close();
	}
}

/** Converts the form, and holds each run and each redrawn piece to the box the layout gave its stretch. */
async function expectPlaced(bytes: Uint8Array) {
	const drawn = await redrawn(bytes);
	const { placed, runs } = await laidOut(bytes);

	expect(runs.map((run) => ({ x: run.x, width: run.width }))).toEqual(
		placed.map(({ x, width }) => ({ x, width }))
	);
	runs.forEach((run, i) => {
		expect(run.baseline).toBeGreaterThan(placed[i].top);
		expect(run.baseline).toBeLessThan(placed[i].bottom);
	});
	expect(drawn.map(([piece]) => piece)).toEqual(runs.map((run) => run.text.trim()));
	drawn.forEach(([, x, baseline], i) => {
		expect(x).toBeCloseTo(runs[i].x, 2);
		expect(baseline).toBeCloseTo(runs[i].baseline, 2);
	});
	return { placed, runs };
}

it.each([
	['in the middle', 'DATE&#9;AFTER', ['DATE', 'AFTER']],
	['at the start', '&#9;LEAD', ['LEAD']],
	['at the end', 'TRAIL&#9;', ['TRAIL']],
	['twice in a row', 'A&#9;&#9;B', ['A', 'B']]
])(
	'draws text with a tab %s where the layout put each part',
	async (_, text, parts) => {
		const { runs } = await expectPlaced(await printed(text));
		expect(runs.map((run) => run.text)).toEqual(parts);
	},
	120_000
);

it('draws text that wraps after a tab where the layout put each part of each line', async () => {
	const words = 'that is long enough to go on to a second line of the box it is printed in';
	const { placed, runs } = await expectPlaced(await printed(`Sample&#9;text ${words}`));
	expect(runs[0].text).toBe('Sample');
	expect(runs.map((run) => run.text.trim()).join(' ')).toBe(`Sample text ${words}`);
	// The line the tab is on holds two runs, and the next line starts at the box's left.
	expect(placed.length).toBeGreaterThan(2);
	expect(placed[1].top).toBe(placed[0].top);
	expect(placed[2].top).toBeGreaterThan(placed[1].top);
	expect(placed[2].x).toBe(20);
}, 120_000);

it("draws a field's caption with a tab where the layout put each part", async () => {
	const { runs } = await expectPlaced(
		await dynamicForm(
			'<field name="f" x="20pt" y="20pt" w="300pt" h="40pt"><ui><textEdit/></ui><caption placement="left" reserve="150pt"><value><text>DATE&#9;AFTER</text></value></caption></field>'
		)
	);
	expect(runs.map((run) => run.text)).toEqual(['DATE', 'AFTER']);
}, 120_000);

it('still refuses a character the standard fonts cannot encode, by the part that holds it', async () => {
	await expect(xfaToAcroForm(await printed('Sample&#9;Ω'))).rejects.toMatchObject({
		refusal: { code: 'unpaintable', page: 0, construct: 'glyph', detail: 'Ω' }
	});
}, 120_000);
