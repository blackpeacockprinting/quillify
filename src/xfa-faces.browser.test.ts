/**
 * A dynamic form is laid out in the faces the package ships, so its text
 * measures the same on every platform, and it is redrawn at those widths.
 */

import { PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import travelUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import trainingUrl from '../test/fixtures/SF182_Authorization_Agreement_and_Certification_of_Training.pdf?url';
import { displayList, type Run } from './display-list.js';
import { normalizePdf } from './normalize.js';
import { sanitize } from './sanitize.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';

const published = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

afterEach(() => {
	vi.restoreAllMocks();
});

/** DD 2875 redrawn, and every run the layout gave the redraw. */
async function redrawn() {
	const runs: Run[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		for (const run of displayList(laid, page.pageNumber).runs) runs.push(run);
		return laid;
	});
	return { pdf: await xfaToAcroForm(await normalizePdf(await published(saarUrl))), runs };
}

// Helvetica's widths are the ones Liberation Sans is cut to, and a fallback
// serif's are not: in one, a run of this form is up to 14% off them.
it('measures every run of DD 2875 within 0.5% of the advances of the face it asks for', async () => {
	const { runs } = await redrawn();
	const doc = await PDFDocument.create();
	const faces = {
		regular: await doc.embedFont(StandardFonts.Helvetica),
		bold: await doc.embedFont(StandardFonts.HelveticaBold),
		italic: await doc.embedFont(StandardFonts.HelveticaOblique),
		boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique)
	};
	const off = runs.filter((run) => {
		const face =
			faces[
				run.bold && run.italic
					? 'boldItalic'
					: run.bold
						? 'bold'
						: run.italic
							? 'italic'
							: 'regular'
			];
		let advances = 0;
		for (const char of run.text) advances += face.widthOfTextAtSize(char, run.size);
		advances += run.letterSpacing * (run.text.length - 1);
		return Math.abs(run.width / advances - 1) > 0.005;
	});

	expect(new Set(runs.map((run) => run.family))).toEqual(new Set(['Arial-PdfJS-XFA']));
	expect({ runs: runs.length, off: off.length }).toEqual({ runs: 289, off: 0 });
}, 120_000);

it('redraws DD 2875 with no run scaled across: each is within 3% of the width it was measured at', async () => {
	const { pdf } = await redrawn();
	const doc = await PDFDocument.load(pdf);
	const scaled = doc.context
		.enumerateIndirectObjects()
		.filter(
			([, object]) => object instanceof PDFRawStream && !object.dict.has(PDFName.of('Subtype'))
		)
		.flatMap(
			([, object]) =>
				new TextDecoder()
					.decode(decodePDFRawStream(object as PDFRawStream).decode())
					.match(/\S+ Tz/g) ?? []
		);

	expect(scaled).toEqual([]);
}, 120_000);

it.each([
	['a static form', trainingUrl],
	['a static form that carries an XFA packet', travelUrl],
	['a dynamic form', saarUrl]
])(
	'fetches a face of the package for a dynamic form and for no other: %s',
	async (_, url) => {
		const pdf = await published(url);
		const fetched = vi.spyOn(globalThis, 'fetch');
		expect(await sanitize(pdf)).toMatchObject({ ok: true });

		const faces = fetched.mock.calls.filter(([asked]) => String(asked).endsWith('.ttf'));
		expect(faces.length > 0).toBe(url === saarUrl);
	},
	120_000
);

it('ends a conversion with an error that names the face that did not load', async () => {
	const saar = await published(saarUrl);
	await commands.withhold('LiberationSans-Bold.ttf');
	try {
		await expect(sanitize(saar)).rejects.toThrow(
			/^LiberationSans-Bold\.ttf did not load from http/
		);
	} finally {
		await commands.serve('LiberationSans-Bold.ttf');
	}
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);

it('ends a conversion with an error that names the face whose body did not arrive', async () => {
	const saar = await published(saarUrl);
	const real = globalThis.fetch;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (asked, init) =>
		String(asked).includes('LiberationSans-Bold.ttf')
			? new Response(
					new ReadableStream({ start: (controller) => controller.error(new Error('x')) }),
					{ status: 200 }
				)
			: real(asked, init)
	);
	await expect(sanitize(saar)).rejects.toThrow(/^LiberationSans-Bold\.ttf did not load from http/);
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);
