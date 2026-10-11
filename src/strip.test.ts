import { readFileSync } from 'node:fs';
import {
	PDFDict,
	PDFDocument,
	PDFName,
	PDFRawStream,
	PDFString,
	decodePDFRawStream
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

const FIXTURE = readFileSync('test/fixtures/acroform-sample.pdf');

/** The background of a file of one 612 by 792 page. */
const strip = async (source: Uint8Array) =>
	stripAcroForm(source, await viewsOf(source, [[0, 0, 612, 792]]));

function annotSubtypes(doc: PDFDocument): string[] {
	return doc.getPages().flatMap((page) => {
		const annots = page.node.Annots();
		if (!annots) return [];
		return annots.asArray().map((entry) => {
			const dict = doc.context.lookup(entry) as PDFDict;
			return (dict.get(PDFName.of('Subtype')) as PDFName).decodeText();
		});
	});
}

const XFA_MARKERS = [
	'<xdp:xdp',
	'<template xmlns="http://www.xfa.org/schema/xfa-template',
	'xfa:datasets'
];

/** Every stream in the file, inflated. A marker inside a compressed stream is still in the file. */
async function streamText(bytes: Uint8Array): Promise<string> {
	const doc = await PDFDocument.load(bytes);
	return doc.context
		.enumerateIndirectObjects()
		.filter(([, object]) => object instanceof PDFRawStream)
		.map(([, object]) =>
			new TextDecoder('latin1').decode(decodePDFRawStream(object as PDFRawStream).decode())
		)
		.join('\n');
}

/**
 * A tagged, layered source file that describes itself, scripts itself and
 * carries a file, as the published forms do: `/Info`, XMP, a document script, an
 * attachment, a bookmark that runs a script, the XFA rendering flag, and two
 * fields whose widgets the structure tree points at, one of them on no page.
 */
async function described(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const { context } = doc;
	const font = context.register(
		context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' })
	);
	page.node.set(PDFName.of('Resources'), context.obj({ Font: { F1: font } }));
	page.node.set(
		PDFName.of('Contents'),
		context.register(context.flateStream('BT /F1 12 Tf (Printed on the page) Tj ET'))
	);
	const info = context.lookup(context.trailerInfo.Info, PDFDict);
	info.set(PDFName.of('Author'), PDFString.of('1234567890A'));
	info.set(PDFName.of('Title'), PDFString.of('form.xfdl, saved by jdoe'));
	doc.catalog.set(
		PDFName.of('Metadata'),
		context.register(
			context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/">Z:\\Logos\\jdoe</x:xmpmeta>', {
				Type: 'Metadata',
				Subtype: 'XML'
			})
		)
	);
	const script = context.register(
		context.flateStream('app.alert("Open this form in a newer reader");')
	);
	const report = context.register(
		context.flateStream('<!-- pdf-source="file:///C|/Users/jdoe/Desktop/form.pdf" -->', {
			Type: 'EmbeddedFile'
		})
	);
	doc.catalog.set(
		PDFName.of('Names'),
		context.obj({
			JavaScript: {
				Names: [
					PDFString.of('check'),
					context.register(context.obj({ S: 'JavaScript', JS: script }))
				]
			},
			EmbeddedFiles: {
				Names: [
					PDFString.of('report.html'),
					context.register(
						context.obj({ Type: 'Filespec', F: PDFString.of('report.html'), EF: { F: report } })
					)
				]
			}
		})
	);
	const bookmark = context.register(
		context.obj({
			Title: PDFString.of('Name'),
			A: { S: 'JavaScript', JS: PDFString.of('this.getField("Name").setFocus();') }
		})
	);
	doc.catalog.set(
		PDFName.of('Outlines'),
		context.obj({ Type: 'Outlines', First: bookmark, Last: bookmark, Count: 1 })
	);
	doc.catalog.set(PDFName.of('NeedsRendering'), context.obj(true));
	doc.catalog.set(PDFName.of('ViewerPreferences'), context.obj({ DisplayDocTitle: true }));
	doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));
	doc.catalog.set(PDFName.of('MarkInfo'), context.obj({ Marked: true }));
	doc.getForm().createTextField('Name').addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
	doc
		.getForm()
		.createTextField('Unplaced')
		.addToPage(page, { x: 72, y: 660, width: 200, height: 20 });
	const [placed, unplaced] = page.node.Annots()!.asArray();
	page.node.Annots()!.remove(1);
	const tagged = [placed, unplaced].map((widget) =>
		context.register(
			context.obj({ Type: 'StructElem', S: 'Form', K: { Type: 'OBJR', Obj: widget } })
		)
	);
	doc.catalog.set(
		PDFName.of('StructTreeRoot'),
		context.register(context.obj({ Type: 'StructTreeRoot', K: tagged }))
	);
	doc.catalog.set(PDFName.of('OCProperties'), context.obj({ OCGs: [], D: { Order: [] } }));
	return doc.save({ useObjectStreams: false });
}

/** A hybrid form's catalog: `/XFA` as the packet array LiveCycle writes, or as one stream. */
async function hybrid(shape: 'array' | 'stream'): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const packet = (xml: string) => doc.context.register(doc.context.flateStream(xml));
	const template = `<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><?templateDesigner SavePath C:\\Users\\jdoe\\form.xdp?></template>`;
	const datasets = '<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"/>';
	const xfa =
		shape === 'array'
			? [PDFString.of('template'), packet(template), PDFString.of('datasets'), packet(datasets)]
			: packet(`<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">${template}${datasets}</xdp:xdp>`);
	doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [], XFA: xfa }));
	return doc.save();
}

describe('stripAcroForm', () => {
	it('removes the AcroForm, every Widget and the Link whose address is a name', async () => {
		const before = await PDFDocument.load(FIXTURE);
		expect(before.catalog.has(PDFName.of('AcroForm'))).toBe(true);
		expect(annotSubtypes(before)).toEqual([
			'Widget',
			'Widget',
			'Widget',
			'Widget',
			'Widget',
			'Link'
		]);

		const stripped = await strip(FIXTURE);
		const after = await PDFDocument.load(stripped);
		expect(after.catalog.has(PDFName.of('AcroForm'))).toBe(false);
		expect(annotSubtypes(after)).toEqual([]);
		expect(after.getPageCount()).toBe(1);

		// Unlinking leaves the objects in the file, and a background that still
		// carries a form layer is one the renderer would stamp over.
		const bytes = new TextDecoder('latin1').decode(stripped);
		expect(bytes).not.toContain('/Widget');
		expect(bytes).not.toContain('/AcroForm');
	});

	it.each(['array', 'stream'] as const)(
		'leaves no XFA packet in the file when /XFA is a packet %s',
		async (shape) => {
			const source = await hybrid(shape);
			expect(await streamText(source)).toContain(XFA_MARKERS[1]);

			const text = await streamText(await strip(source));
			for (const marker of XFA_MARKERS) expect(text).not.toContain(marker);
			expect(text).not.toContain('jdoe');
		}
	);

	it('keeps the pages with their layers, tags and language, and nothing else the file hangs on its catalog', async () => {
		const source = await described();
		const carried = [
			'jdoe',
			'1234567890A',
			'xmpmeta',
			'app.alert',
			'pdf-source',
			'setFocus',
			'/Widget'
		];
		const all = async (bytes: Uint8Array) =>
			`${await streamText(bytes)}\n${new TextDecoder('latin1').decode(bytes)}`;
		const before = await all(source);
		for (const marker of carried) expect(before).toContain(marker);

		const stripped = await strip(source);
		const after = await PDFDocument.load(stripped, { updateMetadata: false });
		expect(after.context.trailerInfo.Info).toBeUndefined();
		expect(
			after.catalog
				.keys()
				.map((key) => key.decodeText())
				.sort()
		).toEqual(['Lang', 'MarkInfo', 'OCProperties', 'Pages', 'StructTreeRoot', 'Type']);
		const text = await all(stripped);
		for (const marker of carried) expect(text).not.toContain(marker);

		expect(after.getPageCount()).toBe(1);
		expect(text).toContain('(Printed on the page)');
		expect(text).toContain('/Helvetica');
	});

	it('makes the frame it is handed the MediaBox, and keeps no CropBox', async () => {
		const src = await PDFDocument.create();
		const page = src.addPage([612, 792]);
		page.setCropBox(50, 40, 512, 712);
		const source = await src.save();
		const out = await PDFDocument.load(
			await stripAcroForm(source, await viewsOf(source, [[50, 40, 562, 752]]))
		);
		const box = out.getPage(0).getMediaBox();
		expect(box).toEqual({ x: 50, y: 40, width: 512, height: 712 });
		expect(out.getPage(0).node.has(PDFName.of('CropBox'))).toBe(false);
	});
});
