/**
 * Dynamic Adobe LiveCycle forms, which carry no field on the page at all.
 * `xfaToAcroForm` runs pdf.js's XFA layout ahead of the inventory and writes
 * each back with a field tree. Three are fixtures, and `corpus/` names
 * fourteen more.
 */

import { describe, expect, it } from 'vitest';
import leaveUrl from '../test/fixtures/DAF988_Leave_Request_Authorization.pdf?url';
import readyReserveUrl from '../test/fixtures/DAF1288_Application_for_Ready_Reserve_Assignment.pdf?url';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { openPdf } from './pdfjs.js';
import { xfaToAcroForm } from './xfa.js';

const FORMS = [
	{ name: 'DD 2875 SAAR', url: saarUrl, pages: 3, widgets: 85, radios: 0, tooltips: 85 },
	{
		name: 'DAF 1288 ready reserve',
		url: readyReserveUrl,
		pages: 2,
		widgets: 122,
		radios: 26,
		tooltips: 43
	},
	// Its template sets `xfa-font-horizontal-scale` six times, which pdf.js emits as `scaleX()`.
	{ name: 'DAF 988 leave request', url: leaveUrl, pages: 3, widgets: 166, radios: 0, tooltips: 156 }
] as const;

async function convert(url: string): Promise<Uint8Array> {
	return xfaToAcroForm(await normalizePdf(new Uint8Array(await (await fetch(url)).arrayBuffer())));
}

describe('a dynamic form, laid out and written back as an AcroForm', () => {
	for (const form of FORMS) {
		it(`${form.name}: ${form.widgets} fields on ${form.pages} pages`, async () => {
			const inventory = await inventoryPdf(await convert(form.url));
			expect(inventory.pages).toHaveLength(form.pages);
			expect(inventory.widgets).toHaveLength(form.widgets);

			for (const widget of inventory.widgets)
				for (const { page: index, rect } of widget.places) {
					const page = inventory.pages[index];
					expect(rect.w, widget.id).toBeGreaterThan(0);
					expect(rect.h, widget.id).toBeGreaterThan(0);
					expect(rect.x, widget.id).toBeGreaterThanOrEqual(0);
					expect(rect.y, widget.id).toBeGreaterThanOrEqual(0);
					expect(rect.x + rect.w, widget.id).toBeLessThanOrEqual(page.width + 0.5);
					expect(rect.y + rect.h, widget.id).toBeLessThanOrEqual(page.height + 0.5);
				}
			expect(new Set(inventory.widgets.map((w) => w.id)).size).toBe(form.widgets);
			expect(inventory.widgets.filter((w) => w.tooltip)).toHaveLength(form.tooltips);
		}, 300_000);
	}

	it('DAF 1288 converts with its radio options in nine groups, one on-state each', async () => {
		const inventory = await inventoryPdf(await convert(readyReserveUrl));
		const radios = inventory.widgets.filter((w) => w.radioButton);
		expect(radios).toHaveLength(26);
		// Nine exclusion groups. Emitting one boolean per option instead would let
		// every option of a group be ticked at once, which is what the group exists
		// to forbid, and `form@0.2.0` has no per-widget on-state to fix it with.
		const groups = new Map<string, Set<string>>();
		for (const radio of radios) {
			const states = groups.get(radio.name) ?? new Set();
			expect(radio.buttonValue, radio.id).toBeTruthy();
			expect(states.has(radio.buttonValue!), `${radio.name} repeats ${radio.buttonValue}`).toBe(
				false
			);
			states.add(radio.buttonValue!);
			groups.set(radio.name, states);
		}
		expect(groups.size).toBe(9);
		// Each option carries its own caption. Writing `/TU` to every kid of the
		// group gives all of them the last one's.
		const captions = radios.filter((r) => r.tooltip).map((r) => `${r.name}|${r.tooltip}`);
		expect(captions.length).toBeGreaterThan(0);
		expect(new Set(captions).size).toBe(captions.length);
	}, 300_000);

	it('DD 2875 lands its fields where the form draws them', async () => {
		const inventory = await inventoryPdf(await convert(saarUrl));
		// Geometry read off the browser's own layout, in points. This one assertion
		// catches a stale copy of the viewer stylesheet, a pdf.js layout change and
		// a Chromium change alike, which a byte comparison on the CSS would not.
		const request = inventory.widgets.find((w) => w.id.endsWith('type_of_request'));
		expect(request).toBeDefined();
		expect(request!.places).toHaveLength(1);
		expect(request!.places[0].rect.x).toBeCloseTo(19.08, 1);
		expect(request!.places[0].rect.y).toBeCloseTo(153.74, 1);
		expect(request!.places[0].rect.w).toBeCloseTo(242.64, 1);
		expect(request!.places[0].rect.h).toBeCloseTo(16.31, 1);
	}, 300_000);

	it('stamps no chrome over the page it just drew', async () => {
		// For a text field, a checkbox and a dropdown pdf-lib asks whether the key
		// is `in` the options, and defaults a missing background to white and a
		// missing border to black. Left out, every widget of this form paints a white
		// box with a black border over the transcription, which covers the
		// `cui_list` banners at the top and bottom of its first two pages.
		const { pdf, close } = await openPdf(await convert(saarUrl));
		try {
			const widgets = [];
			for (let n = 1; n <= pdf.numPages; n++) {
				const annotations = (await (await pdf.getPage(n)).getAnnotations()) as {
					subtype: string;
					backgroundColor: unknown;
					borderColor: unknown;
				}[];
				widgets.push(...annotations.filter((a) => a.subtype === 'Widget'));
			}
			expect(widgets).toHaveLength(85);
			expect(widgets.filter((a) => a.backgroundColor)).toHaveLength(0);
			expect(widgets.filter((a) => a.borderColor)).toHaveLength(0);
		} finally {
			await close();
		}
	}, 300_000);
});
