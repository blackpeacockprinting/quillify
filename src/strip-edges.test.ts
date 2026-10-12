/**
 * What `stripAcroForm` does where the carried tests do not look: views that are
 * not the file's pages, an annotation that says so by one key, a link written
 * in place, a bare key on a claimed object, the objects a plain value names,
 * and the trailer.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

const BOX: [number, number, number, number] = [0, 0, 612, 792];
const DAMAGED = { refusal: { code: 'damaged' } };
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

async function sheet(pages = 1) {
	const doc = await PDFDocument.create();
	const [page] = Array.from({ length: pages }, () => doc.addPage([612, 792]));
	return { doc, page, context: doc.context, catalog: doc.catalog };
}
/** The background of a file of 612 by 792 pages, as pdf-lib reads it. */
async function stripped(doc: PDFDocument) {
	const source = await doc.save({ useObjectStreams: false });
	const bytes = await stripAcroForm(
		source,
		await viewsOf(
			source,
			doc.getPages().map(() => BOX)
		)
	);
	const read = await PDFDocument.load(bytes, { updateMetadata: false });
	return { bytes, catalog: read.catalog, page: read.getPages()[0].node };
}

it('refuses as damaged a view more than the file has pages', async () => {
	const source = await (await sheet()).doc.save({ useObjectStreams: false });
	const [view] = await viewsOf(source, [BOX]);
	await expect(stripAcroForm(source, [view, view])).rejects.toMatchObject(DAMAGED);
});

it('refuses as damaged a second page viewed as another generation of its object', async () => {
	const source = await (await sheet(2)).doc.save({ useObjectStreams: false });
	const [first, second] = await viewsOf(source, [BOX, BOX]);
	const other = { ...second, ref: { ...second.ref!, gen: 1 } };
	await expect(stripAcroForm(source, [first, other])).rejects.toMatchObject(DAMAGED);
});

it('keeps both pages of a file one of which sits under a node that has a /Rect, and not the key', async () => {
	const { doc, page, context, catalog } = await sheet(2);
	const tree = catalog.get(PDFName.of('Pages'));
	const inner = context.register(
		context.obj({ Type: 'Pages', Parent: tree, Kids: [page.ref], Count: 1, Rect: [0, 0, 1, 1] })
	);
	page.node.set(PDFName.of('Parent'), inner);
	catalog.Pages().set(PDFName.of('Kids'), context.obj([inner, doc.getPages()[1].ref]));
	const read = await PDFDocument.load((await stripped(doc)).bytes);
	expect(read.getPageCount()).toBe(2);
	expect(read.getPage(0).node.Parent()!.has(PDFName.of('Rect'))).toBe(false);
});

it.each([{ Type: 'Annot' }, { Subtype: 'Widget' }])(
	'refuses as damaged a file whose /Properties names an object that says %o',
	async (keys) => {
		const { doc, page, context } = await sheet();
		const MC0 = context.register(context.obj(keys));
		page.node.set(PDFName.of('Resources'), context.obj({ Properties: { MC0 } }));
		await expect(stripped(doc)).rejects.toMatchObject(DAMAGED);
	}
);

it('keeps no link written in place that leads to a named destination', async () => {
	const { doc, page, context } = await sheet();
	const link = { Type: 'Annot', Subtype: 'Link', Rect: [10, 700, 110, 720] };
	page.node.set(PDFName.of('Annots'), context.obj([{ ...link, Dest: PDFString.of('chapter') }]));
	expect((await stripped(doc)).page.has(PDFName.of('Annots'))).toBe(false);
});

it('takes a bare key off an object that names a dictionary another key reaches, and keeps the file', async () => {
	const { doc, catalog } = await sheet();
	catalog.set(PDFName.of('Lang'), catalog.get(PDFName.of('Pages'))!);
	expect((await stripped(doc)).catalog.has(PDFName.of('Lang'))).toBe(false);
});

it('keeps each object a value that leads nowhere names, the first the walk meets and an array of them', async () => {
	const { doc, page, context, catalog } = await sheet();
	const [type, tree] = ['Type', 'Pages'].map((key) => catalog.get(PDFName.of(key))!);
	catalog.delete(PDFName.of('Type'));
	catalog.delete(PDFName.of('Pages'));
	catalog.set(PDFName.of('Lang'), context.register(PDFString.of('en-US')));
	catalog.set(PDFName.of('Type'), type);
	catalog.set(PDFName.of('Pages'), tree);
	const color = context.register(
		context.obj([1, 0, 0].map((part) => context.register(context.obj(part))))
	);
	const link = {
		Type: 'Annot',
		Subtype: 'Link',
		Rect: [10, 700, 110, 720],
		C: color,
		A: { S: 'URI', URI: PDFString.of('https://example.com/') }
	};
	page.node.set(PDFName.of('Annots'), context.obj([context.register(context.obj(link))]));

	const background = await stripped(doc);
	expect(background.catalog.lookup(PDFName.of('Lang'), PDFString).asString()).toBe('en-US');
	const kept = background.page.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
	const parts = kept.lookup(PDFName.of('C'), PDFArray);
	expect([0, 1, 2].map((index) => parts.lookup(index)?.toString())).toEqual(['1', '0', '0']);
});

it('writes a trailer with no /ID, whose /Size is one past the largest object number left', async () => {
	const { doc, context } = await sheet();
	context.register(context.obj({ Unreached: true }));
	context.trailerInfo.ID = context.obj([PDFHexString.of('00'), PDFHexString.of('01')]);
	expect(latin1(await doc.save({ useObjectStreams: false }))).toContain('/ID');

	const text = latin1((await stripped(doc)).bytes);
	const numbers = [...text.matchAll(/^(\d+) 0 obj/gm)].map(([, number]) => Number(number));
	expect(text).not.toContain('/ID');
	expect(Number(/\/Size (\d+)/.exec(text)![1])).toBe(Math.max(...numbers) + 1);
});
