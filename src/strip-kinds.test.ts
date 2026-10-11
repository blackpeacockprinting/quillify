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

/** The background of one 612 by 792 page, with what `plant` hangs on it. */
async function background(plant: (page: PDFDict, context: PDFContext) => void) {
	const source = await PDFDocument.create();
	plant(source.addPage([612, 792]).node, source.context);
	const saved = await source.save({ useObjectStreams: false });
	const bytes = await stripAcroForm(saved, await viewsOf(saved, [BOX]));
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

it("gives an object one kind: a page's content that its resources name as a form is no form", async () => {
	const { page } = await background((node, context) => {
		const both = context.register(context.stream('q Q', FORM));
		node.set(PDFName.of('Contents'), both);
		node.set(PDFName.of('Resources'), context.obj({ XObject: { Fm0: both } }));
	});
	expect(streamKeys(under(page, 'Contents'))).toEqual(['Length']);
	expect(keys(under(page, 'Resources', 'XObject') as PDFDict)).toEqual([]);
});

it("gives an object one kind: an image that another's /DecodeParms names as its globals is the image", async () => {
	const { page } = await background((node, context) => {
		const both = context.register(context.stream('x', IMAGE));
		const other = context.stream('x', { ...IMAGE, DecodeParms: { K: 0, JBIG2Globals: both } });
		node.set(
			PDFName.of('Resources'),
			context.obj({ XObject: { Im0: both, Im1: context.register(other) } })
		);
	});
	expect(streamKeys(under(page, 'Resources', 'XObject', 'Im0'))).toEqual([
		'BitsPerComponent',
		'Height',
		'Length',
		'Subtype',
		'Type',
		'Width'
	]);
	const other = under(page, 'Resources', 'XObject', 'Im1') as PDFRawStream;
	expect(keys(other.dict.lookup(PDFName.of('DecodeParms'), PDFDict))).toEqual(['K']);
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

it('keeps what the tags name, through a dictionary, an array and a stream', async () => {
	const { text } = await background((_, context) => {
		const marked = context.register(context.obj({ Sample: PDFString.of('KEPT') }));
		const stream = context.register(context.stream('x', { Sample: marked }));
		const tags = context.obj({ K: context.register(context.obj([stream])) });
		context
			.lookup(context.trailerInfo.Root, PDFDict)
			.set(PDFName.of('StructTreeRoot'), context.register(tags));
	});
	expect(text).toContain('KEPT');
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
