/** The refusals no carried test reaches, each at the stage that throws it. */

import { PDFDocument, PDFName, PDFString, degrees, type PDFPage } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import { displayList } from './display-list.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { MAX_PAGES } from './types.js';
import type { XfaPage } from './xfa-layer.js';

describe('what the inventory refuses', () => {
	it('refuses a PDF with a page over the cap, with both numbers', async () => {
		const doc = await PDFDocument.create();
		for (let page = 0; page <= MAX_PAGES; page++) doc.addPage([612, 792]);
		await expect(inventoryPdf(await doc.save())).rejects.toMatchObject({
			refusal: { code: 'too_many_pages', pages: MAX_PAGES + 1, limit: MAX_PAGES }
		});
	});

	it('refuses a PDF that declares an XFA template and has no field', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		const template = doc.context.register(doc.context.flateStream('<template/>'));
		doc.catalog.set(
			PDFName.of('AcroForm'),
			doc.context.obj({ Fields: [], XFA: [PDFString.of('template'), template] })
		);
		await expect(inventoryPdf(await doc.save())).rejects.toMatchObject({
			refusal: { code: 'no_fields', xfa: true }
		});
	});

	it('refuses a PDF that has no field and declares no XFA form, and says so', async () => {
		const sample = await (await fetch(sampleUrl)).arrayBuffer();
		const doc = await PDFDocument.load(sample);
		const form = doc.getForm();
		for (const field of form.getFields()) form.removeField(field);
		expect(doc.catalog.has(PDFName.of('AcroForm'))).toBe(true);
		await expect(inventoryPdf(await doc.save())).rejects.toMatchObject({
			refusal: { code: 'no_fields', xfa: false }
		});
	});

	it('refuses a portfolio that holds no attachment, and names none', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		doc.catalog.set(PDFName.of('Collection'), doc.context.obj({ View: PDFName.of('D') }));
		const refused = await inventoryPdf(await doc.save()).catch((err: unknown) => err);
		expect((refused as { refusal: unknown }).refusal).toEqual({ code: 'portfolio' });
	});
});

describe('a rotation', () => {
	/** One page with one field, turned, then through qpdf as every file is. */
	async function turned(turn: (doc: PDFDocument, page: PDFPage) => void): Promise<Uint8Array> {
		const doc = await PDFDocument.create();
		const page = doc.addPage([612, 792]);
		doc
			.getForm()
			.createTextField('unit')
			.addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
		turn(doc, page);
		return normalizePdf(await doc.save());
	}
	const rotate = (degrees: number) => (doc: PDFDocument, page: PDFPage) =>
		page.node.set(PDFName.of('Rotate'), doc.context.obj(degrees));

	it("is folded into the page by normalizePdf when it is the page's own quarter turn", async () => {
		const inventory = await inventoryPdf(await turned((_, page) => page.setRotation(degrees(90))));
		expect(inventory.pages).toEqual([{ width: 792, height: 612 }]);
		expect(inventory.widgets).toHaveLength(1);
	});

	it.each([
		[
			'inherited from the page tree',
			(doc: PDFDocument) => doc.catalog.Pages().set(PDFName.of('Rotate'), doc.context.obj(90))
		],
		['of 450 degrees', rotate(450)],
		['of -90 degrees', rotate(-90)]
	])('is refused by its page when it is %s, which qpdf leaves', async (_, turn) => {
		await expect(inventoryPdf(await turned(turn))).rejects.toMatchObject({
			refusal: { code: 'rotated', page: 0 }
		});
	});
});

describe('what the redraw of a dynamic form refuses', () => {
	let host: HTMLDivElement | undefined;
	afterEach(() => host?.remove());

	/** A laid-out page holding one element, the way `XfaLayer.render` emits it. */
	function laid(html: string): XfaPage {
		host = document.createElement('div');
		host.style.cssText = 'position:absolute;left:0;top:0;width:612px;height:792px';
		host.innerHTML = `<div class="xfaLayer">${html}</div>`;
		document.body.append(host);
		return {
			layer: host.firstElementChild as HTMLElement,
			origin: host.getBoundingClientRect(),
			width: 612,
			height: 792
		};
	}
	const box = (style: string) => `<div style="width:100px;height:50px;${style}"></div>`;

	it.each([
		['an image', '<img width="10" height="10">', { construct: 'image' }],
		[
			'a background image',
			box('background-image:linear-gradient(#000,#fff)'),
			{ construct: 'background_image' }
		],
		[
			'a quarter turn of a box in the flow',
			box('transform:rotate(90deg)'),
			{ construct: 'transform' }
		],
		['a dotted border', box('border:1px dotted #000'), { construct: 'border', detail: 'dotted' }]
	])('refuses %s by its page and its construct', (_, html, construct) => {
		// displayList takes pdf.js's page number, which counts from 1.
		expect(() => displayList(laid(html), 2)).toThrow(
			expect.objectContaining({ refusal: { code: 'unpaintable', page: 1, ...construct } })
		);
	});
});
