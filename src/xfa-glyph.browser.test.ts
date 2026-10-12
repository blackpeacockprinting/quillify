import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFString,
	PDFRawStream,
	decodePDFRawStream,
	type PDFRef
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import { normalizePdf } from './normalize.js';
import { openPdf } from './pdfjs.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';

/** DD 2875 with one caption of its XFA template reworded. */
async function recaptioned(from: string, to: string): Promise<Uint8Array> {
	const published = new Uint8Array(await (await fetch(saarUrl)).arrayBuffer());
	const doc = await PDFDocument.load(published, { updateMetadata: false });
	const packets = doc.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.lookup(PDFName.of('XFA'), PDFArray)
		.asArray();
	const named = packets.findIndex(
		(part) => part instanceof PDFString && part.asString() === 'template'
	);
	const template = packets[named + 1] as PDFRef;
	const xml = new TextDecoder().decode(
		decodePDFRawStream(doc.context.lookup(template) as PDFRawStream).decode()
	);
	expect(xml.split(from), `captions that read "${from}"`).toHaveLength(2);
	doc.context.assign(
		template,
		doc.context.flateStream(new TextEncoder().encode(xml.replace(from, to)))
	);
	return doc.save();
}

/** A one-page dynamic form that prints `text` on one line, turned by `rotate` degrees. */
const printed = (text: string, rotate = 0) =>
	dynamicForm(
		`<draw x="100pt" y="300pt" w="200pt" h="60pt" rotate="${rotate}"><value><text>${text}</text></value></draw>`
	);

/** The box the layout gives the first `char` of the form's text, in points from the page's top left. */
async function laidOut(bytes: Uint8Array, char: string) {
	const stage = new XfaStage();
	const opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready });
	try {
		const laid = await stage.lay(await opened.pdf.getPage(1));
		const owner = laid.layer.ownerDocument;
		const node = owner.createTreeWalker(laid.layer, NodeFilter.SHOW_TEXT).nextNode()!;
		const range = owner.createRange();
		range.setStart(node, node.nodeValue!.indexOf(char));
		range.setEnd(node, node.nodeValue!.indexOf(char) + 1);
		const { left, bottom, width } = range.getBoundingClientRect();
		return { left: left - laid.origin.left, bottom: bottom - laid.origin.top, width };
	} finally {
		stage.close();
		await opened.close();
	}
}

/** The pieces of text pdf.js reads off the redrawn page, each with where it starts and its width, the page's fonts, and each horizontal scale its content sets. */
async function redrawn(bytes: Uint8Array) {
	const converted = await xfaToAcroForm(bytes);
	const doc = await PDFDocument.load(converted);
	const named = doc.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict).values();
	const fonts = [
		...new Set(
			named.map((font) => doc.context.lookup(font, PDFDict).get(PDFName.of('BaseFont'))!.toString())
		)
	];
	const scales = doc.context
		.enumerateIndirectObjects()
		.filter(
			([, object]) => object instanceof PDFRawStream && !object.dict.has(PDFName.of('Subtype'))
		)
		.flatMap(([, object]) =>
			[
				...new TextDecoder()
					.decode(decodePDFRawStream(object as PDFRawStream).decode())
					.matchAll(/(\S+) Tz/g)
			].map(([, scale]) => Number(scale))
		);
	const { pdf, close } = await openPdf(converted);
	try {
		const { items } = await (await pdf.getPage(1)).getTextContent();
		const pieces = items.flatMap((item) =>
			'str' in item && item.str.trim()
				? [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width }]
				: []
		);
		return { fonts, pieces, scales };
	} finally {
		await close();
	}
}

// pdf.js reads a piece in ZapfDingbats as its codes: `s` is the triangle that
// points up and `t` the one that points down.
const MARKS = [
	['U+25B2', '▲', 's', '/ZapfDingbats'],
	['U+25BC', '▼', 't', '/ZapfDingbats'],
	['U+03BC', 'μ', 'μ', '/Symbol'],
	['U+2191', '↑', '↑', '/Symbol'],
	['U+2192', '→', '→', '/Symbol']
];

it.each(MARKS)(
	'draws %s, which the text fonts lack, where the layout has it',
	async (_, char, read, face) => {
		const bytes = await printed(`Before ${char} after`);
		const { fonts, pieces } = await redrawn(bytes);
		expect(pieces.map(({ text }) => text)).toEqual(['Before', read, 'after']);
		expect(fonts).toEqual(['/Times-Roman', face]);
		const [, mark, after] = pieces;
		const layout = await laidOut(bytes, char);
		expect(Math.abs(mark.x - layout.left)).toBeLessThan(0.05);
		// The mark has the advance of the face it is drawn in, and what follows it
		// starts that far from where the layout has it: 1.1 pt at most in 10 pt text.
		expect(Math.abs(mark.width - layout.width)).toBeLessThan(1.1);
		expect(Math.abs(after.x - (await laidOut(bytes, 'a')).left)).toBeLessThan(1.1);
	},
	120_000
);

it('draws a mark in a turned run along the way the run reads', async () => {
	const bytes = await printed('Before ▲ after', 90);
	const { pieces } = await redrawn(bytes);
	expect(pieces.map(({ text }) => text)).toEqual(['Before', 's', 'after']);
	const [before, mark, after] = pieces;
	const layout = await laidOut(bytes, '▲');
	expect(mark.x).toBeCloseTo(before.x, 2);
	expect(after.x).toBeCloseTo(before.x, 2);
	expect(Math.abs(792 - mark.y - layout.bottom)).toBeLessThan(0.05);
	expect(Math.abs(792 - after.y - (await laidOut(bytes, 'a')).bottom)).toBeLessThan(1.1);
}, 120_000);

// A form that carries a font dictionary is laid out in the face it names, and
// Arial is the Liberation Sans the package ships, whose triangle is 0.99 em
// wide. The one of ZapfDingbats is 0.892 em, so the run is drawn 4% wider.
it('draws a mark in a run it scales across where the scale puts it', async () => {
	const form = await PDFDocument.load(
		await dynamicForm(
			'<draw x="100pt" y="300pt" w="200pt" h="60pt"><font typeface="Arial" size="10pt"/><value><text>I ▲ J</text></value></draw>'
		),
		{ updateMetadata: false }
	);
	form.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.set(PDFName.of('DR'), form.context.obj({ Font: {} }));
	const bytes = await form.save();

	const { fonts, pieces, scales } = await redrawn(bytes);
	expect(pieces.map(({ text }) => text)).toEqual(['I', 's', 'J']);
	expect(fonts).toEqual(['/Helvetica', '/ZapfDingbats']);
	const [before, mark, after] = pieces;
	const first = await laidOut(bytes, 'I');
	const last = await laidOut(bytes, 'J');
	// To half a percent: the width a browser gives a run differs a little by
	// platform, 104.3% on macOS and 104.1% on Linux.
	expect(scales).toEqual([expect.closeTo(104.2, 0), 100]);
	expect(Math.abs(after.x + after.width - last.left - last.width)).toBeLessThan(0.05);
	expect(Math.abs(before.width - (first.width * scales[0]) / 100)).toBeLessThan(0.05);
	expect(Math.abs(before.x - first.left)).toBeLessThan(0.05);
	// The scale widens the spaces as it widens the letters, so the mark is as far
	// from the letter before it as the letter after it is from the mark.
	const gap = mark.x - before.x - before.width;
	expect(gap).toBeGreaterThan(2.7);
	expect(Math.abs(after.x - mark.x - mark.width - gap)).toBeLessThan(0.05);
}, 120_000);

it('draws U+2010 as the hyphen of the face its run is in', async () => {
	const bytes = await printed('Before\u2010after');
	const { fonts, pieces } = await redrawn(bytes);
	expect(pieces.map(({ text }) => text)).toEqual(['Before-after']);
	expect(fonts).toEqual(['/Times-Roman']);
	expect(Math.abs(pieces[0].x - (await laidOut(bytes, 'B')).left)).toBeLessThan(0.05);
}, 120_000);

it('refuses a dynamic form by the page and the run that hold a character no standard font can encode', async () => {
	const bytes = await recaptioned('21. OPTIONAL INFORMATION', '21. OPTIONAL INFORMATION \u20dd');
	await expect(xfaToAcroForm(await normalizePdf(bytes))).rejects.toMatchObject({
		refusal: {
			code: 'unpaintable',
			page: 1,
			construct: 'glyph',
			detail: '21. OPTIONAL INFORMATION \u20dd'
		}
	});
}, 120_000);
