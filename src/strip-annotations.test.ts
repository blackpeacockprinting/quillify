import { PDFDict, PDFDocument, PDFName, PDFString, type PDFRef } from 'pdf-lib';
import { expect, it } from 'vitest';
import { stripAcroForm } from './strip.js';

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

async function annotationSubtypes(pdf: Uint8Array): Promise<string[]> {
	const doc = await PDFDocument.load(pdf);
	return doc
		.getPages()
		.flatMap((page) =>
			(page.node.Annots()?.asArray() ?? []).map((entry) =>
				doc.context.lookup(entry, PDFDict).lookup(PDFName.of('Subtype'), PDFName).decodeText()
			)
		);
}

/** A structure tree that names each annotation, as a tagged form's does. */
function tag({ catalog, context }: PDFDocument, annotations: PDFRef[]) {
	const elements = annotations.map((annotation) =>
		context.register(
			context.obj({ Type: 'StructElem', S: 'Annot', K: { Type: 'OBJR', Obj: annotation } })
		)
	);
	catalog.set(
		PDFName.of('StructTreeRoot'),
		context.register(context.obj({ Type: 'StructTreeRoot', K: elements }))
	);
}

function attachment({ context }: PDFDocument) {
	return context.register(
		context.obj({
			Type: 'Annot',
			Subtype: 'FileAttachment',
			Rect: [10, 660, 30, 680],
			T: PDFString.of('ATTACHMENT-AUTHOR'),
			FS: {
				Type: 'Filespec',
				F: PDFString.of('attached.txt'),
				EF: { F: context.register(context.stream('ATTACHED-PAYLOAD', { Type: 'EmbeddedFile' })) }
			}
		})
	);
}
const ATTACHED = ['ATTACHED-PAYLOAD', 'attached.txt', 'ATTACHMENT-AUTHOR'];

it('keeps the link on a tagged page, and nothing of the attachment or the note beside it', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const { context } = doc;
	const file = attachment(doc);
	const note = context.register(
		context.obj({
			Type: 'Annot',
			Subtype: 'Text',
			Rect: [40, 660, 60, 680],
			T: PDFString.of('NOTE-AUTHOR'),
			Contents: PDFString.of('NOTE-TEXT')
		})
	);
	const link = context.register(
		context.obj({
			Type: 'Annot',
			Subtype: 'Link',
			Rect: [10, 700, 110, 720],
			A: { S: 'URI', URI: PDFString.of('https://example.com/') }
		})
	);
	page.node.set(PDFName.of('Annots'), context.obj([file, note, link]));
	tag(doc, [file, note]);
	const source = await doc.save({ useObjectStreams: false });
	const carried = [...ATTACHED, 'NOTE-AUTHOR', 'NOTE-TEXT'];
	for (const marker of carried) expect(latin1(source)).toContain(marker);

	const background = await stripAcroForm(source);
	expect(await annotationSubtypes(background)).toEqual(['Link']);
	for (const marker of carried) expect(latin1(background)).not.toContain(marker);
});

it('tells a widget from a link when /Subtype is an indirect reference', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const { context } = doc;
	const widget = context.register(
		context.obj({
			Type: 'Annot',
			Subtype: context.register(PDFName.of('Widget')),
			FT: 'Tx',
			T: PDFString.of('indirect_subtype'),
			Rect: [10, 600, 210, 620]
		})
	);
	const link = context.register(
		context.obj({
			Type: 'Annot',
			Subtype: context.register(PDFName.of('Link')),
			Rect: [10, 700, 110, 720],
			A: { S: 'URI', URI: PDFString.of('https://example.com/') }
		})
	);
	page.node.set(PDFName.of('Annots'), context.obj([widget, link]));

	const background = await stripAcroForm(await doc.save({ useObjectStreams: false }));
	expect(await annotationSubtypes(background)).toEqual(['Link']);
	expect(latin1(background)).not.toContain('indirect_subtype');
});

it('deletes a widget on no page whose /Subtype is a reference, though the tags name it', async () => {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const { context } = doc;
	// No /Rect and no /Type, so the subtype is all that says what it is.
	const widget = context.register(
		context.obj({
			Subtype: context.register(PDFName.of('Widget')),
			FT: 'Tx',
			T: PDFString.of('off_page_widget')
		})
	);
	tag(doc, [widget]);

	const background = await stripAcroForm(await doc.save({ useObjectStreams: false }));
	expect(latin1(background)).not.toContain('off_page_widget');
});

it('deletes an annotation that no page lists and the tags still name', async () => {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const { context } = doc;
	const script = context.register(
		context.obj({
			Subtype: 'Link',
			Rect: [10, 700, 110, 720],
			A: { S: 'JavaScript', JS: PDFString.of('app.alert("OFF-PAGE-SCRIPT")') }
		})
	);
	tag(doc, [attachment(doc), script]);

	const background = latin1(await stripAcroForm(await doc.save({ useObjectStreams: false })));
	for (const marker of [...ATTACHED, 'OFF-PAGE-SCRIPT']) expect(background).not.toContain(marker);
});

it.each([
	['a widget with no /Rect', { Subtype: 'Widget', FT: 'Tx', T: PDFString.of('PARTIAL') }],
	[
		'an annotation with a /Rect and no /Subtype',
		{ Rect: [10, 600, 30, 620], T: PDFString.of('PARTIAL') }
	],
	['an annotation by its /Type alone', { Type: 'Annot', Contents: PDFString.of('PARTIAL') }]
])('deletes %s that the tags name, on a page or off one', async (_, partial) => {
	for (const listed of [true, false]) {
		const doc = await PDFDocument.create();
		const page = doc.addPage([612, 792]);
		const annotation = doc.context.register(doc.context.obj(partial));
		if (listed) page.node.set(PDFName.of('Annots'), doc.context.obj([annotation]));
		tag(doc, [annotation]);

		const background = await stripAcroForm(await doc.save({ useObjectStreams: false }));
		expect(latin1(background), listed ? 'on a page' : 'off one').not.toContain('PARTIAL');
	}
});
