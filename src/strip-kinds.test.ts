/**
 * What a page paints from is told its kind and keeps the keys of that kind: its
 * resources, its content, an image, a form, and the dictionary of each stream.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNull,
	PDFNumber,
	PDFRef,
	PDFString,
	type PDFCatalog,
	type PDFContext,
	type PDFObject,
	type PDFRawStream
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

const BOX: [number, number, number, number] = [0, 0, 612, 792];
const IMAGE = { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8 };
const FORM = { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] };

type Plant = (page: PDFDict, context: PDFContext) => void;

/** What the strip makes of one 612 by 792 page, with what `plant` hangs on it. */
async function stripped(plant: Plant) {
	const source = await PDFDocument.create();
	plant(source.addPage([612, 792]).node, source.context);
	const saved = await source.save({ useObjectStreams: false });
	return stripAcroForm(saved, await viewsOf(saved, [BOX]));
}

/** The background of that page. */
async function background(plant: Plant) {
	const bytes = await stripped(plant);
	const doc = await PDFDocument.load(bytes);
	const page = doc.getPage(0).node;
	return { doc, page, text: new TextDecoder('latin1').decode(bytes) };
}

/** An object nothing should reach, and that says so in the bytes. */
const hidden = (context: PDFContext) =>
	context.register(context.obj({ Private: PDFString.of('PRIVATE') }));

const keys = (dict: PDFDict) =>
	dict
		.keys()
		.map((key) => key.decodeText())
		.sort();
const under = (dict: PDFDict, ...path: string[]) =>
	path.reduce<PDFObject | undefined>(
		(held, key) => (held instanceof PDFDict ? held.lookup(PDFName.of(key)) : undefined),
		dict
	);
const streamKeys = (stream: PDFObject | undefined) => keys((stream as PDFRawStream).dict);

it('keeps of a /Resources its name maps and /ProcSet, and no other key', async () => {
	const { page, text } = await background((node, context) =>
		node.set(
			PDFName.of('Resources'),
			context.obj({
				Font: {},
				XObject: {},
				ExtGState: {},
				ColorSpace: {},
				Pattern: {},
				Shading: {},
				Properties: {},
				ProcSet: ['PDF'],
				Sample: hidden(context)
			})
		)
	);
	expect(keys(under(page, 'Resources') as PDFDict)).toEqual([
		'ColorSpace',
		'ExtGState',
		'Font',
		'Pattern',
		'ProcSet',
		'Properties',
		'Shading',
		'XObject'
	]);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of an /XObject map an image and a form, and no entry of another subtype', async () => {
	const { page, text } = await background((node, context) =>
		node.set(
			PDFName.of('Resources'),
			context.obj({
				XObject: {
					Im0: context.register(context.stream('x', IMAGE)),
					Fm0: context.register(context.stream('q Q', FORM)),
					Ps0: context.register(context.stream('PRIVATE', { Type: 'XObject', Subtype: 'PS' })),
					No0: context.register(context.stream('PRIVATE', { Type: 'XObject' })),
					Di0: context.register(context.obj({ ...FORM, Private: PDFString.of('PRIVATE') }))
				}
			})
		)
	);
	expect(keys(under(page, 'Resources', 'XObject') as PDFDict)).toEqual(['Fm0', 'Im0']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a form what paints it, and neither /PieceInfo nor /LastModified', async () => {
	const { page, text } = await background((node, context) =>
		node.set(
			PDFName.of('Resources'),
			context.obj({
				XObject: {
					Fm0: context.register(
						context.stream('q Q', {
							...FORM,
							FormType: 1,
							Matrix: [1, 0, 0, 1, 0, 0],
							Resources: { ProcSet: ['PDF'], Sample: hidden(context) },
							PieceInfo: { Sample: { Private: hidden(context) } },
							LastModified: PDFString.of('D:20000101000000Z'),
							Metadata: context.register(context.stream('PRIVATE')),
							Ref: { F: { Type: 'Filespec', F: PDFString.of('PRIVATE.pdf') }, Page: 0 }
						})
					)
				}
			})
		)
	);
	const form = under(page, 'Resources', 'XObject', 'Fm0');
	expect(streamKeys(form)).toEqual([
		'BBox',
		'FormType',
		'Length',
		'Matrix',
		'Resources',
		'Subtype',
		'Type'
	]);
	expect(keys((form as PDFRawStream).dict.lookup(PDFName.of('Resources'), PDFDict))).toEqual([
		'ProcSet'
	]);
	expect(text).not.toContain('PRIVATE');
	expect(text).not.toContain('D:2000');
});

it("keeps of a stream's dictionary its length and how it decodes, and no file it names", async () => {
	const outside = (context: PDFContext) => ({
		F: { Type: 'Filespec', F: PDFString.of('PRIVATE.bin') },
		FFilter: 'FlateDecode',
		FDecodeParms: { Private: hidden(context) }
	});
	const { page, text } = await background((node, context) => {
		node.set(PDFName.of('Contents'), context.register(context.stream('q Q', outside(context))));
		node.set(
			PDFName.of('Resources'),
			context.obj({
				XObject: {
					Im0: context.register(
						context.stream('x', {
							...IMAGE,
							...outside(context),
							Filter: 'FlateDecode',
							DecodeParms: { Predictor: 12, Columns: 1, Sample: hidden(context) }
						})
					),
					Fm0: context.register(context.stream('q Q', { ...FORM, ...outside(context) }))
				}
			})
		);
	});
	expect(streamKeys(under(page, 'Contents'))).toEqual(['Length']);
	const image = under(page, 'Resources', 'XObject', 'Im0');
	expect(streamKeys(image)).toEqual([
		'BitsPerComponent',
		'DecodeParms',
		'Filter',
		'Height',
		'Length',
		'Subtype',
		'Type',
		'Width'
	]);
	expect(keys((image as PDFRawStream).dict.lookup(PDFName.of('DecodeParms'), PDFDict))).toEqual([
		'Columns',
		'Predictor'
	]);
	expect(streamKeys(under(page, 'Resources', 'XObject', 'Fm0'))).toEqual([
		'BBox',
		'Length',
		'Subtype',
		'Type'
	]);
	expect(text).not.toContain('PRIVATE');
});

it('refuses as damaged a file whose page names one stream as its content and, in its resources, as a form', async () => {
	const file = stripped((node, context) => {
		const both = context.register(context.stream('q Q', FORM));
		node.set(PDFName.of('Contents'), both);
		node.set(PDFName.of('Resources'), context.obj({ XObject: { Fm0: both } }));
	});
	await expect(file).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});

it("refuses as damaged a file whose image is the globals of another image's /DecodeParms", async () => {
	const file = stripped((node, context) => {
		const both = context.register(context.stream('x', IMAGE));
		const other = context.stream('x', { ...IMAGE, DecodeParms: { K: 0, JBIG2Globals: both } });
		node.set(
			PDFName.of('Resources'),
			context.obj({ XObject: { Im0: both, Im1: context.register(other) } })
		);
	});
	await expect(file).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});

it('refuses as damaged a file whose /Font and /XObject name one dictionary as their map', async () => {
	const file = stripped((node, context) => {
		const both = context.register(
			context.obj({ X0: context.register(context.stream('q Q', FORM)) })
		);
		node.set(PDFName.of('Resources'), context.obj({ Font: both, XObject: both }));
	});
	await expect(file).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});

it('refuses as damaged a file whose /Font names an image the walk has reached, and deletes the entry where the walk reaches it first', async () => {
	const plant =
		(...maps: string[]): Plant =>
		(node, context) => {
			const image = context.register(context.stream('x', IMAGE));
			const resources = Object.fromEntries(maps.map((map) => [map, { X0: image }]));
			node.set(PDFName.of('Resources'), context.obj(resources));
		};
	await expect(stripped(plant('XObject', 'Font'))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
	const { page } = await background(plant('Font', 'XObject'));
	expect(keys(under(page, 'Resources', 'Font') as PDFDict)).toEqual([]);
	expect(keys(under(page, 'Resources', 'XObject') as PDFDict)).toEqual(['X0']);
});

it('keeps under each key an object that two keys of one kind name', async () => {
	const { page } = await background((node, context) => {
		const form = context.register(context.stream('q Q', FORM));
		const mask = context.register(context.stream('x', IMAGE));
		const image = context.register(context.stream('x', { ...IMAGE, Mask: mask, SMask: mask }));
		const XObject = { Fm0: form, Fm1: form, Im0: image, Im1: mask };
		node.set(PDFName.of('Resources'), context.obj({ XObject }));
	});
	const held = under(page, 'Resources', 'XObject') as PDFDict;
	expect(keys(held)).toEqual(['Fm0', 'Fm1', 'Im0', 'Im1']);
	expect(held.get(PDFName.of('Fm1'))).toBe(held.get(PDFName.of('Fm0')));
	const image = (under(held, 'Im0') as PDFRawStream).dict;
	expect(image.get(PDFName.of('Mask'))).toBe(held.get(PDFName.of('Im1')));
	expect(image.get(PDFName.of('SMask'))).toBe(held.get(PDFName.of('Im1')));
});

it('keeps under a key that leads nowhere a number by reference, and neither a dictionary nor an array that holds itself', async () => {
	const { page, text } = await background((node, context) => {
		node.set(PDFName.of('StructParents'), context.register(context.obj(0)));
		node.set(PDFName.of('Tabs'), hidden(context));
		const array = context.obj([]);
		array.push(context.register(array));
		node.set(PDFName.of('Rotate'), array);
	});
	expect(keys(page)).toEqual(['MediaBox', 'Parent', 'Resources', 'StructParents', 'Type']);
	expect(page.lookup(PDFName.of('StructParents'), PDFNumber).asNumber()).toBe(0);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a page no /Parent that names an object outside the page tree', async () => {
	const { page, text } = await background((node, context) =>
		node.set(
			PDFName.of('Parent'),
			context.register(
				context.obj({ Type: 'Pages', Kids: [], Count: 0, Private: PDFString.of('PRIVATE') })
			)
		)
	);
	expect(keys(page)).toEqual(['MediaBox', 'Resources', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a page no /Parent that names an object the walk reaches as another kind', async () => {
	const { page } = await background((node, context) => {
		const content = context.register(context.stream('q Q'));
		node.set(PDFName.of('Contents'), content);
		node.set(PDFName.of('Parent'), content);
	});
	expect(keys(page)).toEqual(['Contents', 'MediaBox', 'Resources', 'Type']);
});

it('keeps under a key that leads nowhere a null', async () => {
	const { page, text } = await background((node) => node.set(PDFName.of('Tabs'), PDFNull));
	expect(keys(page)).toEqual(['MediaBox', 'Parent', 'Resources', 'Tabs', 'Type']);
	expect(text).toContain('/Tabs null');
});

it('keeps a value that leads nowhere under each key that names it by reference', async () => {
	const { page } = await background((node, context) => {
		const number = context.register(context.obj(0));
		node.set(PDFName.of('Rotate'), number);
		node.set(PDFName.of('UserUnit'), number);
		const Widths = context.register(context.obj([500]));
		const font = {
			Type: 'Font',
			Subtype: 'TrueType',
			BaseFont: 'Sample',
			FirstChar: 32,
			LastChar: 32
		};
		node.set(
			PDFName.of('Resources'),
			context.obj({ Font: { F1: { ...font, Widths }, F2: { ...font, Widths } } })
		);
	});
	expect(keys(page)).toEqual(['MediaBox', 'Parent', 'Resources', 'Rotate', 'Type', 'UserUnit']);
	for (const name of ['F1', 'F2']) {
		const font = under(page, 'Resources', 'Font', name) as PDFDict;
		expect(font.lookup(PDFName.of('Widths'), PDFArray).size()).toBe(1);
	}
});

it('keeps of a list the entries of its kind, and neither a wrong one before them nor an array', async () => {
	const { page, text } = await background((node, context) => {
		const content = context.register(context.stream('q Q'));
		node.set(PDFName.of('Contents'), context.obj([hidden(context), [hidden(context)], content]));
	});
	const contents = page.lookup(PDFName.of('Contents'), PDFArray);
	expect(contents.size()).toBe(1);
	expect(streamKeys(contents.lookup(0))).toEqual(['Length']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a /DecodeParms under 2,000 arrays, each by reference, the first array and nothing in it', async () => {
	const { page, text } = await background((node, context) => {
		let parms = context.register(context.obj({ Predictor: 12, Sample: hidden(context) }));
		for (let i = 0; i < 2000; i++) parms = context.register(context.obj([parms]));
		const image = context.stream('x', { ...IMAGE, Filter: 'FlateDecode', DecodeParms: parms });
		node.set(PDFName.of('Resources'), context.obj({ XObject: { Im0: context.register(image) } }));
	});
	const image = under(page, 'Resources', 'XObject', 'Im0') as PDFRawStream;
	expect(image.dict.lookup(PDFName.of('DecodeParms'), PDFArray).size()).toBe(0);
	expect(text).not.toContain('Predictor');
	expect(text).not.toContain('PRIVATE');
});

it('keeps no name map that is an array or a stream', async () => {
	const { page, text } = await background((node, context) =>
		node.set(
			PDFName.of('Resources'),
			context.obj({
				XObject: [hidden(context)],
				Font: context.register(context.stream('PRIVATE', { F1: hidden(context) })),
				ProcSet: ['PDF']
			})
		)
	);
	expect(keys(under(page, 'Resources') as PDFDict)).toEqual(['ProcSet']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps no key that leads to a kind and references an object the file does not hold', async () => {
	const { page } = await background((node, context) => {
		const missing = PDFRef.of(999);
		const image = context.stream('x', { ...IMAGE, SMask: missing });
		node.set(
			PDFName.of('Resources'),
			context.obj({ XObject: { Im0: context.register(image), Im1: missing } })
		);
	});
	expect(keys(under(page, 'Resources', 'XObject') as PDFDict)).toEqual(['Im0']);
	expect(streamKeys(under(page, 'Resources', 'XObject', 'Im0'))).toEqual([
		'BitsPerComponent',
		'Height',
		'Length',
		'Subtype',
		'Type',
		'Width'
	]);
});

it('keeps no page that the page tree holds as a dictionary written in /Kids', async () => {
	const { doc, text } = await background((node, context) => {
		const tree = node.lookup(PDFName.of('Parent'), PDFDict);
		tree.lookup(PDFName.of('Kids'), PDFArray).push(
			context.obj({
				Type: context.register(PDFName.of('Page')),
				Parent: node.get(PDFName.of('Parent')),
				AA: { O: { S: 'JavaScript', JS: PDFString.of('PRIVATE') } },
				Annots: [
					{
						Subtype: 'Link',
						Rect: [0, 0, 1, 1],
						A: { S: 'URI', URI: PDFString.of('javascript:PRIVATE') }
					}
				]
			})
		);
	});
	expect(doc.catalog.Pages().Kids().size()).toBe(1);
	expect(text).not.toContain('PRIVATE');
});

it('refuses as damaged a file whose page tree names its second page as its /Resources', async () => {
	const source = await PDFDocument.create();
	source.addPage([612, 792]);
	source.catalog.Pages().set(PDFName.of('Resources'), source.addPage([612, 792]).ref);
	const saved = await source.save({ useObjectStreams: false });
	await expect(stripAcroForm(saved, await viewsOf(saved, [BOX, BOX]))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});

it('refuses as damaged a file whose first page names as its /Contents the /Kids its second page is in', async () => {
	const source = await PDFDocument.create();
	const { context } = source;
	const first = source.addPage([612, 792]);
	const second = source.addPage([612, 792]);
	const tree = source.catalog.Pages();
	const kids = context.register(context.obj([second.ref]));
	const inner = context.register(
		context.obj({
			Type: 'Pages',
			Parent: source.catalog.get(PDFName.of('Pages')),
			Kids: kids,
			Count: 1
		})
	);
	second.node.set(PDFName.of('Parent'), inner);
	tree.set(PDFName.of('Kids'), context.obj([first.ref, inner]));
	first.node.set(PDFName.of('Contents'), kids);
	const saved = await source.save({ useObjectStreams: false });
	await expect(stripAcroForm(saved, await viewsOf(saved, [BOX, BOX]))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});

it('refuses as damaged a file whose page sits under a page tree node that says /Subtype /Widget', async () => {
	const source = await PDFDocument.create();
	const { context } = source;
	const page = source.addPage([612, 792]);
	const tree = source.catalog.get(PDFName.of('Pages'));
	const inner = context.register(
		context.obj({ Type: 'Pages', Parent: tree, Kids: [page.ref], Count: 1, Subtype: 'Widget' })
	);
	page.node.set(PDFName.of('Parent'), inner);
	source.catalog.Pages().set(PDFName.of('Kids'), context.obj([inner]));
	const saved = await source.save({ useObjectStreams: false });
	await expect(stripAcroForm(saved, await viewsOf(saved, [BOX]))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});

/** A dictionary that `holder` names under `key`, written as an object of its own. */
const own = (holder: PDFDict, key: string, keys: Record<string, unknown> = {}) => {
	const ref = holder.context.register(holder.context.obj(keys as never));
	holder.set(PDFName.of(key), ref);
	return holder.context.lookup(ref, PDFDict);
};
const fonts = (page: PDFDict) => own(own(page, 'Resources'), 'Font');
const font = (page: PDFDict) =>
	own(fonts(page), 'F1', { Type: 'Font', Subtype: 'Type1', BaseFont: 'Courier' });
const tags = ({ catalog }: PDFDocument) =>
	own(catalog, 'StructTreeRoot', { Type: 'StructTreeRoot' });

/** The background of one page, as text, with what `plant` hangs on the file. The view is made by hand: pdf-lib lists no page of some of these files. */
async function planted(plant: (source: PDFDocument, page: PDFDict) => void) {
	const source = await PDFDocument.create();
	const { node, ref } = source.addPage([612, 792]);
	plant(source, node);
	const view = { ref: { num: ref.objectNumber, gen: ref.generationNumber }, box: BOX };
	const bytes = await stripAcroForm(await source.save({ useObjectStreams: false }), [view]);
	expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
	return new TextDecoder('latin1').decode(bytes);
}

it.each<[name: string, find: (source: PDFDocument, page: PDFDict) => PDFDict]>([
	['the catalog', ({ catalog }) => catalog],
	['the mark information', ({ catalog }) => own(catalog, 'MarkInfo', { Marked: true })],
	['the layers', ({ catalog }) => own(catalog, 'OCProperties')],
	['the default configuration', ({ catalog }) => own(own(catalog, 'OCProperties'), 'D')],
	['a layer', ({ catalog }) => own(own(catalog, 'OCProperties'), 'OCGs', { Type: 'OCG' })],
	['the structure tree', tags],
	['a structure element', (source) => own(tags(source), 'K', { S: 'P' })],
	["a page's resources", (_, page) => own(page, 'Resources')],
	["a page's group", (_, page) => own(page, 'Group', { S: 'Transparency' })],
	['a dictionary of fonts by name', (_, page) => fonts(page)],
	['a font', (_, page) => font(page)],
	[
		"a font's descriptor",
		(_, page) => own(font(page), 'FontDescriptor', { Type: 'FontDescriptor' })
	],
	['a graphics state', (_, page) => own(own(own(page, 'Resources'), 'ExtGState'), 'G1', { LW: 1 })]
])(
	'strips a file that reaches %s, with a /Rect too, and refuses it as damaged where that says /Type /Annot',
	async (_, find) => {
		const says = (key: string, value: PDFObject) =>
			planted((source, page) => find(source, page).set(PDFName.of(key), value));
		await planted(find);
		await says('Rect', PDFNumber.of(0));
		await expect(says('Type', PDFName.of('Annot'))).rejects.toMatchObject({
			refusal: { code: 'damaged' }
		});
	}
);

it.each<[name: string, plant: (source: PDFDocument, page: PDFDict) => void, holds: RegExp]>([
	[
		'a catalog with a /Rect',
		({ catalog }) => catalog.set(PDFName.of('Rect'), PDFNumber.of(0)),
		/^(?![^]*\/Rect)/
	],
	[
		'an empty page tree node with a /Rect',
		({ catalog }) => {
			const tree = catalog.get(PDFName.of('Pages'));
			const empty = { Type: 'Pages', Parent: tree, Kids: [], Count: 0, Rect: [0, 0, 1, 1] };
			catalog
				.Pages()
				.Kids()
				.push(catalog.context.register(catalog.context.obj(empty)));
		},
		/^(?![^]*\/Rect)[^]*\/Count 0/
	],
	[
		'a property list that says /Type /Page',
		(_, page) => own(own(own(page, 'Resources'), 'Properties'), 'MC0', { Type: 'Page' }),
		/\/MC0 \d+ 0 R/
	],
	[
		'a form named /Rect in a dictionary of its own',
		(_, page) =>
			own(own(page, 'Resources'), 'XObject', {
				Rect: page.context.register(page.context.stream('', FORM))
			}),
		/\/Rect \d+ 0 R/
	],
	[
		'a glyph named /Rect in a dictionary of its own',
		(_, page) => {
			const type3 = {
				Type: 'Font',
				Subtype: 'Type3',
				FontBBox: [0, 0, 1, 1],
				FontMatrix: [1, 0, 0, 1, 0, 0]
			};
			const glyph = page.context.register(page.context.stream(''));
			own(own(fonts(page), 'F1', type3), 'CharProcs', { Rect: glyph });
		},
		/\/Rect \d+ 0 R/
	],
	[
		'a role named /Rect in a dictionary of its own',
		(source) => own(tags(source), 'RoleMap', { Rect: 'P' }),
		/\/Rect \/P/
	]
])('strips a file that holds %s, to what its kind keeps', async (_, plant, holds) => {
	expect(await planted(plant)).toMatch(holds);
});

it('keeps a content stream whose dictionary has a /Rect, and not the key', async () => {
	const { page, text } = await background((page, context) =>
		page.set(
			PDFName.of('Contents'),
			context.register(context.stream('PAINT', { Rect: [0, 0, 1, 1] }))
		)
	);
	expect(streamKeys(under(page, 'Contents'))).toEqual(['Length']);
	expect(text).toContain('PAINT');
});

const says = (dict: PDFDict, key: string, name: string) =>
	dict.set(PDFName.of(key), PDFName.of(name));

it.each<[name: string, plant: (catalog: PDFCatalog) => void]>([
	['catalog says /Subtype /Widget', (catalog) => says(catalog, 'Subtype', 'Widget')],
	['catalog says /Type /Annot', (catalog) => says(catalog, 'Type', 'Annot')],
	['catalog says /Type /Page', (catalog) => says(catalog, 'Type', 'Page')],
	['page tree says /Type /Page', (catalog) => says(catalog.Pages(), 'Type', 'Page')],
	[
		'page tree holds itself',
		(catalog) =>
			catalog
				.Pages()
				.Kids()
				.push(catalog.get(PDFName.of('Pages'))!)
	]
])('refuses as damaged a file whose %s', async (_, plant) => {
	const source = await PDFDocument.create();
	const { objectNumber: num, generationNumber: gen } = source.addPage([612, 792]).ref;
	plant(source.catalog);
	const saved = await source.save({ useObjectStreams: false });
	await expect(stripAcroForm(saved, [{ ref: { num, gen }, box: BOX }])).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});
