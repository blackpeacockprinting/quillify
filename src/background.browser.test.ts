/**
 * The background is the point: a format built from a form has to show the
 * form. Five backgrounds, three of them published forms, each read by both
 * renderers: the two do not agree about `/Contents` arrays, and a page whose
 * streams are not joined paints blank in one of them.
 */

import { describe, expect, it } from 'vitest';
import tdyUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import appointmentUrl from '../test/fixtures/DD577_Appointment_Termination_Record.pdf?url';
import sickUrl from '../test/fixtures/DD689_Individual_Sick_Slip.pdf?url';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import { dd2977Shape } from '../test/dd2977-shape.js';
import { fromTree, open } from '../test/engine.js';
import { assembleQuill } from './assemble.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { openPdf } from './pdfjs.js';
import { stripAcroForm } from './strip.js';
import type { QualifiedField, QualifiedForm } from './types.js';

const fetched = (url: string) => async () => new Uint8Array(await (await fetch(url)).arrayBuffer());

/** `streams` is what the file carries before qpdf coalesces them. */
const CASES = [
	{ name: 'dd1610', source: fetched(tdyUrl), streams: 8 },
	{ name: 'dd0577', source: fetched(appointmentUrl), streams: 8 },
	{ name: 'dd0689', source: fetched(sickUrl), streams: 1 },
	{ name: 'dd2977_shape', source: dd2977Shape, streams: 1 },
	{ name: 'fixture', source: fetched(sampleUrl), streams: 1 }
];

/** How much of the page is not blank, as a fraction. */
function inkOf(data: Uint8ClampedArray): number {
	let dark = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i] < 200) dark++;
	return dark / (data.length / 4);
}

async function inkFromPdf(bytes: Uint8Array): Promise<number> {
	const task = await openPdf(bytes);
	try {
		const page = await (await task.promise).getPage(1);
		const viewport = page.getViewport({ scale: 1 });
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		await page.render({ canvas, viewport }).promise;
		const ctx = canvas.getContext('2d')!;
		return inkOf(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
	} finally {
		await task.destroy();
	}
}

describe('the background a built format stamps over', () => {
	for (const probe of CASES) {
		it(`${probe.name}: both renderers paint it, from ${probe.streams} content stream(s)`, async () => {
			const bytes = await normalizePdf(await probe.source());
			const { inventory } = await inventoryPdf(bytes);
			const background = await stripAcroForm(bytes);

			// Ours: the file came out of qpdf and the strip with its page intact.
			expect(await inkFromPdf(background), `${probe.name} background`).toBeGreaterThan(0.004);

			const fields: QualifiedField[] = inventory.widgets.map((w, i) => ({
				widget: w.id,
				name: `field_${i}`,
				label: w.name,
				description: 'd',
				type: w.kind === 'Btn' ? 'boolean' : w.kind === 'Ch' ? 'enum' : 'string',
				multiline: false,
				options: w.kind === 'Ch' ? (w.options.length ? w.options : ['a']) : undefined,
				example: w.kind === 'Tx' ? 'MMMM' : undefined,
				keep: true,
				required: false
			}));
			const form: QualifiedForm = {
				quill: { name: `bg_${probe.name}`, title: 'Probe', description: 'd' },
				fields
			};
			const { ref, quill } = await fromTree(assembleQuill(form, inventory, background));
			const doc = quill.seedDocument();
			let markdown = '';
			let ink = 0;
			try {
				markdown = doc.toMarkdown();
				const session = await open(quill, doc);
				const ctx = document.createElement('canvas').getContext('2d')!;
				session.paint(ctx, 0, 96 / 72);
				session.free();
				// An unpainted canvas is 300 wide and transparent, which `inkOf` reads as ink.
				expect(ctx.canvas.width, `${probe.name} painted`).toBeGreaterThan(300);
				ink = inkOf(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);
			} finally {
				doc.free();
			}
			expect(markdown).toContain(ref);
			expect(ink, `${probe.name} rendered`).toBeGreaterThan(0.004);
		}, 180_000);
	}
});
