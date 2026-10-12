import { expect, it } from 'vitest';
import { page as browser } from 'vitest/browser';
import { dynamicForm } from '../test/dynamic-form.js';
import { displayList } from './display-list.js';
import { inventoryPdf } from './inventory.js';
import { openPdf } from './pdfjs.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets } from './xfa-widgets.js';

const control = (name: string, shape: string, size: number, caption: string) =>
	`<field name="${name}" w="200pt" h="40pt"><ui><checkButton shape="${shape}" size="${size}pt"/></ui><caption ${caption}><value><text>${name}</text></value></caption><items><text>1</text></items></field>`;
/**
 * A check box and a radio button, each in a row far taller than the control is
 * wide, and a check box under its caption, which leaves it a box wider than tall.
 */
const BODY =
	`<subform x="20pt" y="20pt">${control('tall', 'square', 10, 'placement="right" reserve="150pt"')}</subform>` +
	`<exclGroup name="pick" x="20pt" y="100pt">${control('round', 'round', 12, 'placement="right" reserve="150pt"')}</exclGroup>` +
	`<subform x="20pt" y="180pt">${control('wide', 'square', 30, 'placement="top" reserve="26pt"')}</subform>`;

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
const near = ({ x, y, w, h }: Box) => ({
	x: expect.closeTo(x, 1),
	y: expect.closeTo(y, 1),
	w: expect.closeTo(w, 1),
	h: expect.closeTo(h, 1)
});
const boxOf = ({ x, y, w, h }: Box): Box => ({ x, y, w, h });

/** The part of a box in which a screenshot shows anything but white paper. */
async function inked(shot: string, { x, y, w, h }: Box): Promise<Box> {
	const image = new Image();
	image.src = `data:image/png;base64,${shot}`;
	await image.decode();
	const canvas = new OffscreenCanvas(image.width, image.height);
	const context = canvas.getContext('2d')!;
	context.drawImage(image, 0, 0);
	const left = Math.floor(x);
	const top = Math.floor(y);
	const { data, width } = context.getImageData(left, top, Math.ceil(w), Math.ceil(h));
	const columns: number[] = [];
	const rows: number[] = [];
	for (let at = 0; at < data.length; at += 4)
		if (data[at] + data[at + 1] + data[at + 2] < 600) {
			columns.push(left + ((at / 4) % width));
			rows.push(top + Math.floor(at / 4 / width));
		}
	expect(rows.length, 'ink in the box of a control').toBeGreaterThan(0);
	return {
		x: Math.min(...columns),
		y: Math.min(...rows),
		w: Math.max(...columns) + 1 - Math.min(...columns),
		h: Math.max(...rows) + 1 - Math.min(...rows)
	};
}

it('stamps a check box and a radio button on the square the browser paints', async () => {
	const form = await dynamicForm(BODY);
	const stage = new XfaStage();
	const { pdf, close } = await openPdf(form, { enableXfa: true, ownerDocument: await stage.ready });
	let squares: Box[];
	try {
		const laid = await stage.lay(await pdf.getPage(1));
		const controls = [...laid.layer.querySelectorAll('input')].map((el) => {
			const { left, top, width, height } = el.getBoundingClientRect();
			return { x: left - laid.origin.left, y: top - laid.origin.top, w: width, h: height };
		});
		// The premise: pdf.js gives a control what is left of its row, so its box is no square.
		const [tall, round, wide] = controls;
		expect(controls).toHaveLength(3);
		expect(tall.h).toBeGreaterThan(tall.w + 5);
		expect(round.h).toBeGreaterThan(round.w + 5);
		expect(wide.w).toBeGreaterThan(wide.h + 5);
		squares = controls.map(({ x, y, w, h }) => {
			const side = Math.min(w, h);
			return { x: x + (w - side) / 2, y: y + (h - side) / 2, w: side, h: side };
		});

		expect(harvestWidgets(laid, 1).map(boxOf)).toEqual(squares.map(near));
		expect(
			displayList(laid, 1)
				.drawn.filter((item) => 'edges' in item)
				.map(boxOf)
		).toEqual(squares.map(near));

		// And the browser does paint each control in that square of its box.
		expect(devicePixelRatio, 'a pixel of the screenshot is a CSS pixel').toBe(1);
		const frame = document.querySelector<HTMLIFrameElement>('iframe[sandbox]')!;
		frame.style.cssText =
			'position:fixed;left:0;top:0;width:612px;height:792px;border:0;background:white';
		await new Promise((painted) => requestAnimationFrame(() => requestAnimationFrame(painted)));
		const shot = await browser.screenshot({ element: frame, save: false });
		for (const [at, { x, y, w, h }] of controls.entries()) {
			const painted = await inked(shot, { x: x + laid.origin.left, y: y + laid.origin.top, w, h });
			const square = squares[at];
			expect(Math.abs(painted.x - laid.origin.left - square.x)).toBeLessThan(1.5);
			expect(Math.abs(painted.y - laid.origin.top - square.y)).toBeLessThan(1.5);
			expect(Math.abs(painted.w - square.w)).toBeLessThan(1.5);
			expect(Math.abs(painted.h - square.h)).toBeLessThan(1.5);
		}
	} finally {
		stage.close();
		await close();
	}

	const { widgets } = await inventoryPdf(await xfaToAcroForm(form));
	expect(widgets.map((widget) => widget.places[0].rect)).toEqual(squares.map(near));
}, 120_000);
