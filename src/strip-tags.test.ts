/**
 * The structure tree is told its kinds and keeps the keys of each: the root, an
 * element, a marked-content reference, an object reference, an attribute
 * dictionary, the parent tree, the ID tree, and the mark information beside it.
 * A reference from it to what the background does not hold goes.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNull,
	PDFRef,
	PDFString,
	type PDFContext,
	type PDFObject
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

const BOX: [number, number, number, number] = [0, 0, 612, 792];
const LINK = { Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1], Dest: ['Fit'] };

interface Planted {
	page: PDFDict;
	here: PDFRef;
	/** The reference the structure tree's root is written under. */
	root: PDFRef;
	context: PDFContext;
	/** Registers a dictionary, or a stream where it is given content. */
	made: (keys: Record<string, unknown>, content?: string) => PDFRef;
}
/** What a case hangs on the page, and the structure tree's root it returns, with the mark information where it gives one. */
type Plant = (planted: Planted) => {
	tags: Record<string, unknown>;
	marks?: Record<string, unknown>;
};

/** What the strip makes of one 612 by 792 page with a structure tree. */
async function stripped(plant: Plant) {
	const source = await PDFDocument.create();
	const { context, catalog } = source;
	const { node: page, ref: here } = source.addPage([612, 792]);
	const made: Planted['made'] = (keys, content) =>
		context.register(
			content === undefined ? context.obj(keys as never) : context.stream(content, keys as never)
		);
	const root = context.nextRef();
	const { tags, marks } = plant({ page, here, root, context, made });
	context.assign(root, context.obj({ Type: 'StructTreeRoot', ...tags } as never));
	catalog.set(PDFName.of('StructTreeRoot'), root);
	if (marks) catalog.set(PDFName.of('MarkInfo'), context.obj(marks as never));
	const saved = await source.save({ useObjectStreams: false });
	return stripAcroForm(saved, await viewsOf(saved, [BOX]));
}

/** The background of that page. */
async function background(plant: Plant) {
	const bytes = await stripped(plant);
	const doc = await PDFDocument.load(bytes);
	/** What the catalog holds along a path of names and positions, read through references. */
	const under = (...path: (string | number)[]) =>
		path.reduce<PDFObject | undefined>((held, key) => {
			if (held instanceof PDFArray) return held.lookup(key as number);
			return held instanceof PDFDict ? held.lookup(PDFName.of(String(key))) : undefined;
		}, doc.catalog);
	/** The keys of the dictionary at a path. */
	const keys = (...path: (string | number)[]) =>
		(under(...path) as PDFDict)
			.keys()
			.map((key) => key.decodeText())
			.sort();
	/** What an array at a path holds, each part as written. */
	const parts = (...path: (string | number)[]) => (under(...path) as PDFArray).asArray();
	const here = doc.getPage(0).ref;
	return { doc, here, under, keys, parts, text: new TextDecoder('latin1').decode(bytes) };
}

/** A key no row lists, on an object nothing should reach, that says so in the bytes. */
const outside = ({ made }: Planted) => ({ Sample: made({ Private: PDFString.of('PRIVATE') }) });
const TAGS = ['StructTreeRoot'] as const;

it('keeps of the root and of the mark information the keys of each, and no key outside its row', async () => {
	const { keys, under, text } = await background((planted) => ({
		tags: {
			K: planted.made({ S: 'Document' }),
			ParentTreeNextKey: 1,
			RoleMap: { Sample: 'P', Other: outside(planted).Sample, More: [outside(planted).Sample] },
			ClassMap: {
				One: { O: 'Layout', Placement: 'Block', ...outside(planted) },
				Two: [{ O: 'Layout', ...outside(planted) }, 0],
				Three: [[{ O: 'Layout' }]]
			},
			Namespaces: [outside(planted).Sample],
			...outside(planted)
		},
		marks: { Marked: true, Suspects: false, UserProperties: outside(planted).Sample }
	}));
	expect(keys('MarkInfo')).toEqual(['Marked', 'Suspects']);
	expect(keys(...TAGS)).toEqual(['ClassMap', 'K', 'ParentTreeNextKey', 'RoleMap', 'Type']);
	expect(keys(...TAGS, 'RoleMap')).toEqual(['Sample']);
	expect(under(...TAGS, 'RoleMap', 'Sample')).toBe(PDFName.of('P'));
	expect(keys(...TAGS, 'ClassMap')).toEqual(['One', 'Three', 'Two']);
	expect(keys(...TAGS, 'ClassMap', 'One')).toEqual(['O', 'Placement']);
	expect(keys(...TAGS, 'ClassMap', 'Two', 0)).toEqual(['O']);
	expect(String(under(...TAGS, 'ClassMap', 'Three'))).toBe('[ ]');
	expect(text).not.toContain('PRIVATE');
});

it('keeps of an element, a marked-content reference and an attribute dictionary the keys of each, and no stream a key outside its row references', async () => {
	const { doc, keys, here, under, parts, text } = await background((planted) => {
		const { made, here, root } = planted;
		const top = made({ S: 'Document', P: root });
		const element = made({
			Type: 'StructElem',
			S: 'P',
			P: top,
			ID: PDFString.of('ID-KEPT'),
			Pg: here,
			K: [0, { Type: 'MCR', Pg: here, MCID: 1, Stm: outside(planted).Sample }],
			A: [{ O: 'Layout', Placement: 'Block', P: [outside(planted)] }, 0],
			C: ['One', 0],
			T: PDFString.of('T-KEPT'),
			Lang: PDFString.of('en-US'),
			Alt: PDFString.of('ALT-KEPT'),
			E: PDFString.of('E-KEPT'),
			ActualText: PDFString.of('ACTUAL-KEPT'),
			Sample: made({ Type: 'EmbeddedFile' }, 'PRIVATE'),
			AF: [{ Type: 'Filespec', F: PDFString.of('PRIVATE.txt') }],
			NS: outside(planted).Sample
		});
		planted.context.lookup(top, PDFDict).set(PDFName.of('K'), element);
		return { tags: { K: top } };
	});
	const element = [...TAGS, 'K', 'K'] as const;
	expect(keys(...element)).toEqual(
		['A', 'ActualText', 'Alt', 'C', 'E', 'ID', 'K', 'Lang', 'P', 'Pg', 'S', 'T', 'Type'].sort()
	);
	expect((under(...element) as PDFDict).get(PDFName.of('P'))).toBe(
		(under(...TAGS) as PDFDict).get(PDFName.of('K'))
	);
	expect((under(...element) as PDFDict).get(PDFName.of('Pg'))).toBe(here);
	expect((under(...TAGS, 'K') as PDFDict).get(PDFName.of('P'))).toBe(
		doc.catalog.get(PDFName.of('StructTreeRoot'))
	);
	expect(String(parts(...element, 'K')[0])).toBe('0');
	expect(keys(...element, 'K', 1)).toEqual(['MCID', 'Pg', 'Type']);
	expect(keys(...element, 'A', 0)).toEqual(['O', 'Placement']);
	expect(String(parts(...element, 'A')[1])).toBe('0');
	expect(String(under(...element, 'C'))).toBe('[ /One 0 ]');
	for (const kept of ['ID-KEPT', 'T-KEPT', 'ALT-KEPT', 'E-KEPT', 'ACTUAL-KEPT'])
		expect(text).toContain(kept);
	expect(text).not.toContain('PRIVATE');
});

it('takes an object reference out of /K when its /Obj is no link the page keeps', async () => {
	const { keys, under, parts, doc, here, text } = await background(
		({ made, page, here, context }) => {
			const link = made(LINK);
			const widget = made({
				Type: 'Annot',
				Subtype: 'Widget',
				FT: 'Tx',
				T: PDFString.of('PRIVATE'),
				Rect: [0, 0, 1, 1]
			});
			const note = made({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 1, 1] });
			page.set(PDFName.of('Annots'), context.obj([link, widget, note]));
			const to = (Obj: unknown) => ({ Type: 'OBJR', Pg: here, Obj });
			return {
				tags: {
					K: [
						made({ S: 'Form', K: to(widget) }),
						made({
							S: 'Form',
							K: [0, to(widget), to(link), to(note), to(here), to(PDFRef.of(999))]
						}),
						made({ S: 'Link', K: to(link) })
					]
				}
			};
		}
	);
	const link = doc.getPage(0).node.Annots()!.get(0);
	expect(keys(...TAGS, 'K', 0)).toEqual(['S']);
	expect(parts(...TAGS, 'K', 1, 'K').length).toBe(2);
	expect(String(parts(...TAGS, 'K', 1, 'K')[0])).toBe('0');
	for (const kept of [
		[...TAGS, 'K', 1, 'K', 1],
		[...TAGS, 'K', 2, 'K']
	]) {
		expect(keys(...kept)).toEqual(['Obj', 'Pg', 'Type']);
		expect((under(...kept) as PDFDict).get(PDFName.of('Obj'))).toBe(link);
		expect((under(...kept) as PDFDict).get(PDFName.of('Pg'))).toBe(here);
	}
	expect(text).not.toContain('PRIVATE');
});

it('keeps of an element no /Pg that names a page outside the page tree, and no /P that names what is no element', async () => {
	const { keys, text } = await background((planted) => {
		const { made } = planted;
		const orphan = made({
			Type: 'Page',
			AA: { O: { S: 'JavaScript', JS: PDFString.of('PRIVATE') } }
		});
		const element = made({ S: 'P', Pg: orphan, P: outside(planted).Sample });
		const reference = { Type: 'MCR', Pg: orphan, MCID: 0 };
		return { tags: { K: [element, made({ S: 'P', P: element, K: reference })] } };
	});
	expect(keys(...TAGS, 'K', 0)).toEqual(['S']);
	expect(keys(...TAGS, 'K', 1)).toEqual(['K', 'P', 'S']);
	expect(keys(...TAGS, 'K', 1, 'K')).toEqual(['MCID', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of the parent tree its nodes, and makes null an entry that names an object that is no element', async () => {
	const { keys, parts, under, text } = await background((planted) => {
		const { made } = planted;
		const element = made({ S: 'P' });
		const stray = made({ S: 'P', Alt: PDFString.of('PRIVATE') });
		const other = outside(planted).Sample;
		const leaf = made({
			Nums: [0, made([element, other, null] as never), 1, element, 2, stray, 3, [other, element]],
			Limits: [0, 3],
			...outside(planted)
		});
		return {
			tags: {
				K: element,
				ParentTree: made({ Kids: [leaf, other], Limits: [0, 3], ...outside(planted) })
			}
		};
	});
	const element = (under(...TAGS) as PDFDict).get(PDFName.of('K'));
	expect(keys(...TAGS, 'ParentTree')).toEqual(['Kids', 'Limits']);
	expect(parts(...TAGS, 'ParentTree', 'Kids').length).toBe(2);
	expect(keys(...TAGS, 'ParentTree', 'Kids', 1)).toEqual([]);
	expect(keys(...TAGS, 'ParentTree', 'Kids', 0)).toEqual(['Limits', 'Nums']);
	const nums = parts(...TAGS, 'ParentTree', 'Kids', 0, 'Nums');
	expect(nums.filter((_, index) => index % 2 === 0).map(String)).toEqual(['0', '1', '2', '3']);
	expect(parts(...TAGS, 'ParentTree', 'Kids', 0, 'Nums', 1)).toEqual([element, PDFNull, PDFNull]);
	expect(nums[3]).toBe(element);
	expect(nums[5]).toBe(PDFNull);
	expect((nums[7] as PDFArray).asArray()).toEqual([PDFNull, element]);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of an /IDTree its nodes and the elements it names, and no other object', async () => {
	const { keys, parts, under, text } = await background((planted) => {
		const { made } = planted;
		const element = made({ S: 'P', ID: PDFString.of('a') });
		const other = outside(planted).Sample;
		const leaf = made({
			Names: [PDFString.of('a'), element, PDFString.of('b'), other],
			Limits: [PDFString.of('a'), PDFString.of('b')],
			...outside(planted)
		});
		return { tags: { K: element, IDTree: { Kids: [leaf], ...outside(planted) } } };
	});
	const element = (under(...TAGS) as PDFDict).get(PDFName.of('K'));
	expect(keys(...TAGS, 'IDTree')).toEqual(['Kids']);
	expect(keys(...TAGS, 'IDTree', 'Kids', 0)).toEqual(['Limits', 'Names']);
	expect(parts(...TAGS, 'IDTree', 'Kids', 0, 'Names')).toEqual([
		PDFString.of('a'),
		element,
		PDFString.of('b'),
		PDFNull
	]);
	expect(text).not.toContain('PRIVATE');
});

it('keeps nothing of a widget and a page outside the page tree that the tags name as elements, and no entry for either', async () => {
	const { keys, parts, text } = await background(({ made }) => {
		const widget = made({
			Type: 'Annot',
			Subtype: 'Widget',
			FT: 'Tx',
			Rect: [0, 0, 1, 1],
			AP: { N: made({ Subtype: 'Form', BBox: [0, 0, 1, 1] }, 'PRIVATE') },
			A: { S: 'JavaScript', JS: PDFString.of('PRIVATE') },
			Kids: [made({ Subtype: 'Widget', V: PDFString.of('PRIVATE') })]
		});
		const orphan = made({
			Type: 'Page',
			Contents: made({}, 'PRIVATE'),
			AA: { O: { S: 'JavaScript', JS: PDFString.of('PRIVATE') } }
		});
		return { tags: { K: [widget, orphan] } };
	});
	expect(keys(...TAGS)).toEqual(['K', 'Type']);
	expect(parts(...TAGS, 'K')).toEqual([]);
	expect(text).not.toContain('PRIVATE');
	expect(text).not.toContain('/Widget');
});

/** A text field's widget that the page lists, with a value, an appearance and a parent. */
const widget = ({ made, page, context }: Planted) => {
	const field = made({
		Type: 'Annot',
		Subtype: 'Widget',
		FT: 'Tx',
		T: PDFString.of('PRIVATE'),
		V: PDFString.of('PRIVATE'),
		Rect: [0, 0, 1, 1],
		AP: { N: made({ Subtype: 'Form', BBox: [0, 0, 1, 1] }, 'PRIVATE') },
		Parent: made({ T: PDFString.of('PRIVATE') })
	});
	page.set(PDFName.of('Annots'), context.obj([field]));
	return field;
};

it.each<[key: string, plant: Plant]>([
	['RoleMap', (planted) => ({ tags: { RoleMap: widget(planted) } })],
	['ClassMap', (planted) => ({ tags: { ClassMap: widget(planted) } })],
	[
		'Font',
		(planted) => {
			const { page, context } = planted;
			page.set(PDFName.of('Resources'), context.obj({ Font: widget(planted) }));
			return { tags: {} };
		}
	]
])(
	'keeps nothing of a widget that /%s names as a dictionary by name, and not the key',
	async (_, plant) => {
		const { keys, text } = await background(plant);
		expect(keys(...TAGS)).toEqual(['Type']);
		expect(text).not.toMatch(/\/(RoleMap|ClassMap|Font|Widget|FT|V|T|Rect|AP)\b/);
		expect(text).not.toContain('PRIVATE');
	}
);

it.each<[name: string, plant: Plant]>([
	['its page', ({ here }) => ({ tags: { K: [here] } })],
	[
		'a link it keeps',
		({ made, page, context }) => {
			const link = made(LINK);
			page.set(PDFName.of('Annots'), context.obj([link]));
			return { tags: { K: [link] } };
		}
	]
])('refuses as damaged a file whose tags name %s as an element', async (_, plant) => {
	await expect(stripped(plant)).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});
