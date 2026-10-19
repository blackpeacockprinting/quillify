/**
 * A dynamic form is laid out in the faces the package ships, so its text
 * measures the same on every platform, and it is redrawn at those widths.
 */

import {
	PDFDict,
	PDFDocument,
	PDFName,
	PDFObjectCopier,
	PDFRawStream,
	PDFRef,
	PDFString,
	StandardFonts,
	decodePDFRawStream
} from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import eprUrl from '../test/fixtures/AF716_Enlisted_Performance_Brief.pdf?url';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import travelUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import trainingUrl from '../test/fixtures/SF182_Authorization_Agreement_and_Certification_of_Training.pdf?url';
import { dynamicFlow } from '../test/dynamic-form.js';
import { displayList, type Run } from './display-list.js';
import { normalizePdf } from './normalize.js';
import { sanitize } from './sanitize.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';

const published = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** DD 2875 redrawn, and every run the layout gave the redraw. */
async function redrawn() {
	const runs: Run[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		for (const item of displayList(laid, page.pageNumber).drawn)
			if ('text' in item) runs.push(item);
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

/** A form laid out: the runs of its pages, and the faces its stage holds after the last. */
async function staged(file: Uint8Array) {
	const runs: Run[] = [];
	let faces: FontFace[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		for (const item of displayList(laid, page.pageNumber).drawn)
			if ('text' in item) runs.push(item);
		faces = [...laid.layer.ownerDocument.fonts];
		return laid;
	});
	await xfaToAcroForm(await normalizePdf(file));
	return { runs, faces };
}

/** From here on, each face made from bytes: its family, weight and style, and how many bytes. */
function made(): string[] {
	const faces: string[] = [];
	const Face = FontFace;
	vi.stubGlobal(
		'FontFace',
		class extends Face {
			constructor(
				family: string,
				source: string | BufferSource,
				descriptors?: FontFaceDescriptors
			) {
				super(family, source, descriptors);
				if (source instanceof ArrayBuffer)
					faces.push(`${family} ${this.weight} ${this.style} ${source.byteLength}`);
			}
		}
	);
	return faces;
}

/** Each style of `family`, paired with the file of `face` it is to be made from. */
const each = (family: string, face: string): [string, string][] => [
	[`${family} normal normal`, `${face}-Regular.ttf`],
	[`${family} bold normal`, `${face}-Bold.ttf`],
	[`${family} normal italic`, `${face}-Italic.ttf`],
	[`${family} bold italic`, `${face}-BoldItalic.ttf`]
];

/** Faces as `made` gives them, each made from the file of the package it is paired with. */
const from = async (pairs: [string, string][]) =>
	(
		await Promise.all(
			pairs.map(
				async ([face, file]) =>
					`${face} ${(await (await fetch(`/assets/${file}`)).arrayBuffer()).byteLength}`
			)
		)
	).sort();

it("lays AF 716's Calibri out in Carlito, a face for each style its text asks for, in the stage alone", async () => {
	const faces = made();
	await xfaToAcroForm(await normalizePdf(await published(eprUrl)));
	expect(faces.sort()).toEqual(await from(each('Calibri', 'Carlito')));
	expect([...document.fonts]).toEqual([]);
}, 120_000);

/**
 * A form of two pages, with a line in Calibri on the first and a line in its
 * bold and one in its italic on the second, and the fonts `listed` gives it.
 * pdf.js stands Liberation Sans in for a family the form's fonts do not list.
 * Its bold italic is only in a hidden line, a dropdown's options and a text
 * box's value, none of which is drawn.
 */
async function calibri(
	listed: (form: PDFDocument) => Record<string, PDFRef> = () => ({})
): Promise<Uint8Array> {
	const font = (style = '') => `<font typeface="Calibri" size="10pt" ${style}/>`;
	const line = (y: number, style = '', presence = 'visible') =>
		`<draw presence="${presence}" x="72pt" y="${y}pt" w="300pt" h="20pt"><value><text>Laid out in Calibri</text></value>${font(style)}</draw>`;
	const page = (body: string) => `<subform layout="position" w="612pt" h="792pt">${body}</subform>`;
	const unseen = font('weight="bold" posture="italic"');
	const form = await PDFDocument.load(
		await dynamicFlow(
			page(
				line(72) +
					line(100, 'weight="bold" posture="italic"', 'invisible') +
					`<field name="pick" x="72pt" y="128pt" w="200pt" h="20pt"><ui><choiceList/></ui>${unseen}<items><text>Laid out</text><text>in Calibri</text></items></field>` +
					`<field name="note" x="72pt" y="156pt" w="200pt" h="40pt"><ui><textEdit multiLine="1"/></ui>${unseen}<value><text>Laid out in Calibri</text></value></field>`
			) + page(line(72, 'weight="bold"') + line(100, 'posture="italic"'))
		)
	);
	form.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.set(PDFName.of('DR'), form.context.obj({ Font: listed(form) }));
	return form.save();
}

it('lays Calibri out in Carlito where pdf.js would stand Liberation Sans in for it, page by page', async () => {
	const faces = made();
	const { runs, faces: stage } = await staged(await calibri());
	expect(new Set(runs.map((run) => run.family))).toEqual(new Set(['Calibri-PdfJS-XFA']));
	expect(faces.sort()).toEqual(
		await from(
			each('Calibri-PdfJS-XFA', 'Carlito').filter(([face]) => !face.endsWith('bold italic'))
		)
	);
	// pdf.js's own four faces of the family give way.
	expect(stage.filter((face) => face.family === 'Calibri-PdfJS-XFA')).toHaveLength(3);
}, 120_000);

it('lays Calibri out in the face the file embeds, where it embeds one', async () => {
	const training = await PDFDocument.load(await published(trainingUrl), { updateMetadata: false });
	const [, embedded] = training.context
		.enumerateIndirectObjects()
		.find(
			([, object]) =>
				object instanceof PDFDict &&
				object.get(PDFName.of('Subtype')) === PDFName.of('TrueType') &&
				object.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)?.has(PDFName.of('FontFile2'))
		)!;
	const faces = made();
	const { runs, faces: stage } = await staged(
		await calibri((form) => {
			const font = PDFObjectCopier.for(training.context, form.context).copy(embedded) as PDFDict;
			// pdf.js passes over a font whose descriptor names no family.
			font
				.lookup(PDFName.of('FontDescriptor'), PDFDict)
				.set(PDFName.of('FontFamily'), PDFString.of('Calibri'));
			return { Embedded: form.context.register(font) };
		})
	);
	expect(new Set(runs.map((run) => run.family))).toEqual(new Set(['Calibri']));
	expect(stage.filter((face) => face.family === 'Calibri')).toHaveLength(1);
	expect(faces).toEqual([]);
}, 120_000);

it.each([
	['a status that is not ok', (real: Response) => new Response(real.body, { status: 404 })],
	[
		'a request that fails',
		() => {
			throw new TypeError('Failed to fetch');
		}
	],
	[
		'a body that does not arrive',
		() =>
			new Response(
				new ReadableStream({ start: (controller) => controller.error(new Error('x')) }),
				{
					status: 200
				}
			)
	],
	['a body that is no face', () => new Response('<!doctype html>', { status: 200 })]
])(
	'ends a conversion with an error that names the face of Carlito that did not load: %s',
	async (_, answer) => {
		const form = await calibri();
		const real = globalThis.fetch;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (asked, init) => {
			if (String(asked).includes('Carlito-Bold.ttf')) return answer(await real(asked, init));
			// The italic, which the second page also asks for, arrives after the bold has failed.
			if (String(asked).includes('Carlito-Italic.ttf'))
				await new Promise((later) => setTimeout(later, 100));
			return real(asked, init);
		});
		const faces = made();
		let failed: string[] = [];
		const lay = XfaStage.prototype.lay;
		vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(function (this: XfaStage, page) {
			return lay.call(this, page).catch((error: unknown) => {
				failed = [...faces];
				throw error;
			});
		});
		await expect(xfaToAcroForm(await normalizePdf(form))).rejects.toThrow(
			/^Carlito-Bold\.ttf did not load from http/
		);
		// No load outlives the one that failed: the italic was made before the layout failed.
		expect(
			failed.filter((face) => !face.includes(' bold ')).map((face) => face.replace(/ \d+$/, ''))
		).toEqual(['Calibri-PdfJS-XFA normal normal', 'Calibri-PdfJS-XFA normal italic']);
		expect(document.querySelector('iframe')).toBeNull();
	},
	120_000
);
