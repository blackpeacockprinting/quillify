/**
 * What a link and a page kept whole is told its kind and keeps the keys of that
 * kind: a border, a destination, the layers, and the property lists of marked
 * content.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNull,
	PDFStream,
	PDFString,
	type PDFContext,
	type PDFObject,
	type PDFRef
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

const BOX: [number, number, number, number] = [0, 0, 612, 792];
const LINK = { Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] };

/** The background of one 612 by 792 page, with what `plant` hangs on it and on the catalog. */
async function background(plant: (page: PDFDict, context: PDFContext, catalog: PDFDict) => void) {
	const source = await PDFDocument.create();
	plant(source.addPage([612, 792]).node, source.context, source.catalog);
	const saved = await source.save({ useObjectStreams: false });
	const bytes = await stripAcroForm(saved, await viewsOf(saved, [BOX]));
	const doc = await PDFDocument.load(bytes);
	/** What the catalog or the page holds along a path of names and positions, read through references. */
	const under = (from: 'catalog' | 'page', ...path: (string | number)[]) =>
		path.reduce<PDFObject | undefined>(
			(held, key) => {
				const dict = held instanceof PDFStream ? held.dict : held;
				if (dict instanceof PDFArray) return dict.lookup(key as number);
				return dict instanceof PDFDict ? dict.lookup(PDFName.of(String(key))) : undefined;
			},
			from === 'page' ? doc.getPage(0).node : doc.catalog
		);
	/** The keys of the dictionary at a path, or of the stream's dictionary there. */
	const keys = (from: 'catalog' | 'page', ...path: (string | number)[]) => {
		const held = under(from, ...path);
		const dict = held instanceof PDFStream ? held.dict : (held as PDFDict);
		return dict
			.keys()
			.map((key) => key.decodeText())
			.sort();
	};
	return { doc, under, keys, text: new TextDecoder('latin1').decode(bytes) };
}

/** An object nothing should reach, and that says so in the bytes. */
const hidden = (context: PDFContext) =>
	context.register(context.obj({ Private: PDFString.of('PRIVATE') }));
/** A key no row lists, on such an object. */
const outside = (context: PDFContext) => ({ Sample: hidden(context) });
const group = (context: PDFContext, more: Record<string, unknown> = {}): PDFRef =>
	context.register(context.obj({ Type: 'OCG', Name: PDFString.of('A'), ...more } as never));

it('keeps of a destination its page and how the page is framed, and no object a later part references', async () => {
	const { doc, under, text } = await background((page, context) => {
		const here = page.lookup(PDFName.of('Parent'), PDFDict).lookup(PDFName.of('Kids'), PDFArray);
		const links = [
			{ ...LINK, Dest: [here.get(0), 'XYZ', hidden(context), 0, null] },
			{ ...LINK, A: { S: 'GoTo', D: [here.get(0), 'FitR', 0, 0, 1, 1, hidden(context)] } }
		];
		page.set(PDFName.of('Annots'), context.obj(links as never));
	});
	const first = under('page', 'Annots', 0, 'Dest') as PDFArray;
	expect(first.get(0)).toBe(doc.getPage(0).ref);
	expect(first.asArray().slice(1).map(String)).toEqual(['/XYZ', 'null', '0', 'null']);
	const second = under('page', 'Annots', 1, 'A', 'D') as PDFArray;
	expect(second.get(0)).toBe(doc.getPage(0).ref);
	expect(second.asArray().slice(1).map(String)).toEqual(['/FitR', '0', '0', '1', '1']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a destination no first part that is not a page of the page tree', async () => {
	const { under, text } = await background((page, context) => {
		const parent = page.lookup(PDFName.of('Parent'), PDFDict);
		const here = parent.lookup(PDFName.of('Kids'), PDFArray).get(0);
		const links = [
			{ ...LINK, Dest: [hidden(context), 'Fit'] },
			{ ...LINK, Dest: [page.get(PDFName.of('Parent')), 'Fit'] },
			{ ...LINK, Dest: [[here], 'Fit'] },
			{ ...LINK, Dest: [0, 'Fit', hidden(context)] }
		];
		page.set(PDFName.of('Annots'), context.obj(links as never));
	});
	const dest = (link: number) =>
		(under('page', 'Annots', link, 'Dest') as PDFArray).asArray().map(String);
	for (const link of [0, 1, 2]) expect(dest(link)).toEqual(['null', '/Fit']);
	expect(dest(3)).toEqual(['null', '/Fit', 'null']);
	expect(text).not.toContain('PRIVATE');
});

it('refuses as damaged a file whose second page a destination names and no /Kids holds', async () => {
	const source = await PDFDocument.create();
	const { context } = source;
	const first = source.addPage([612, 792]);
	const second = source.addPage([612, 792]);
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
	source.catalog.Pages().set(PDFName.of('Kids'), context.obj([first.ref, inner]));
	first.node.set(PDFName.of('Contents'), kids);
	first.node.set(PDFName.of('Annots'), context.obj([{ ...LINK, Dest: [second.ref, 'Fit'] }]));
	const saved = await source.save({ useObjectStreams: false });
	await expect(stripAcroForm(saved, await viewsOf(saved, [BOX, BOX]))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});

it('keeps of a border style the keys of its row, and no /Border that references an object', async () => {
	const { keys, under, text } = await background((page, context) => {
		const links = [
			{
				...LINK,
				Dest: ['Fit'],
				Border: [0, 0, hidden(context)],
				BS: { Type: 'Border', W: 1, S: 'D', D: [3], R: hidden(context), ...outside(context) }
			},
			{ ...LINK, Dest: ['Fit'], Border: [0, 0, 1, [3, 2]] }
		];
		page.set(PDFName.of('Annots'), context.obj(links as never));
	});
	expect(keys('page', 'Annots', 0)).toEqual(['BS', 'Dest', 'Rect', 'Subtype', 'Type']);
	expect(keys('page', 'Annots', 0, 'BS')).toEqual(['D', 'S', 'Type', 'W']);
	expect(String(under('page', 'Annots', 1, 'Border'))).toBe('[ 0 0 1 [ 3 2 ] ]');
	expect(text).not.toContain('PRIVATE');
});

it('keeps of /OCProperties its groups and its default configuration, and neither /Configs nor a key outside a row', async () => {
	const { keys, under, text } = await background((_, context, catalog) => {
		const shown = group(context, {
			Intent: ['View', 'Design'],
			Usage: {
				CreatorInfo: { Creator: PDFString.of('PRIVATE'), Subtype: 'Artwork' },
				Print: { PrintState: 'ON', ...outside(context) },
				View: { ViewState: 'OFF' },
				...outside(context)
			},
			...outside(context)
		});
		const off = group(context);
		const both = context.register(context.obj([shown, off]));
		const layers = {
			OCGs: [shown, off],
			D: {
				Name: PDFString.of('A'),
				Creator: PDFString.of('PRIVATE'),
				BaseState: 'ON',
				ON: [shown],
				OFF: [off],
				Order: [shown, [context.register(PDFString.of('B')), off]],
				RBGroups: [[shown, off]],
				AS: [
					{ Event: 'View', Category: ['View'], OCGs: both, ...outside(context) },
					{ Event: 'Print', Category: ['Print'], OCGs: both }
				],
				...outside(context)
			},
			Configs: [{ Name: PDFString.of('PRIVATE'), OFF: [shown] }],
			...outside(context)
		};
		catalog.set(PDFName.of('OCProperties'), context.obj(layers as never));
	});
	const layers = ['catalog', 'OCProperties'] as const;
	expect(keys(...layers)).toEqual(['D', 'OCGs']);
	expect(keys(...layers, 'D')).toEqual([
		'AS',
		'BaseState',
		'Name',
		'OFF',
		'ON',
		'Order',
		'RBGroups'
	]);
	expect(keys(...layers, 'D', 'AS', 0)).toEqual(['Category', 'Event', 'OCGs']);
	expect(keys(...layers, 'OCGs', 0)).toEqual(['Intent', 'Name', 'Type', 'Usage']);
	expect(keys(...layers, 'OCGs', 0, 'Usage')).toEqual(['Print', 'View']);
	expect(keys(...layers, 'OCGs', 0, 'Usage', 'Print')).toEqual(['PrintState']);
	const groups = (under(...layers, 'OCGs') as PDFArray).asArray();
	const names = (...path: (string | number)[]) =>
		(under(...layers, 'D', ...path) as PDFArray).asArray();
	expect(names('ON')).toEqual([groups[0]]);
	expect(names('OFF')).toEqual([groups[1]]);
	expect(under(...layers, 'D', 'Order', 1, 0)).toEqual(PDFString.of('B'));
	expect(names('Order', 1)[1]).toBe(groups[1]);
	expect(names('RBGroups', 0)).toEqual(groups);
	expect(names('AS', 0, 'OCGs')).toEqual(groups);
	expect(names('AS', 1, 'OCGs')).toEqual(groups);
	expect(text).not.toContain('PRIVATE');
});

it('keeps an array of groups under each key that names it by a reference', async () => {
	const { keys, under, text } = await background((page, context, catalog) => {
		const off = context.register(context.obj([group(context)]));
		const on = context.register(context.obj([group(context)]));
		const layers = { OCGs: off, D: { OFF: off, ON: on }, ...outside(context) };
		catalog.set(PDFName.of('OCProperties'), context.obj(layers as never));
		const properties = { MC0: { Type: 'OCMD', OCGs: on } };
		page.set(PDFName.of('Resources'), context.obj({ Properties: properties } as never));
	});
	const layers = ['catalog', 'OCProperties'] as const;
	const membership = ['page', 'Resources', 'Properties', 'MC0'] as const;
	const named = (key: string, ...path: Parameters<typeof under>) =>
		(under(...path) as PDFDict).get(PDFName.of(key));
	expect(keys(...layers)).toEqual(['D', 'OCGs']);
	expect(keys(...layers, 'D')).toEqual(['OFF', 'ON']);
	expect(named('OFF', ...layers, 'D')).toBe(named('OCGs', ...layers));
	expect(keys(...layers, 'D', 'OFF', 0)).toEqual(['Name', 'Type']);
	expect(keys(...membership)).toEqual(['OCGs', 'Type']);
	expect(named('ON', ...layers, 'D')).toBe(named('OCGs', ...membership));
	expect(keys(...layers, 'D', 'ON', 0)).toEqual(['Name', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps in the default configuration no reference to a group that no other key reaches, and no array that holds itself', async () => {
	const { under, text } = await background((_, context, catalog) => {
		const listed = group(context);
		const stray = group(context, { Name: PDFString.of('PRIVATE') });
		const loop = context.obj([listed]);
		loop.push(context.register(loop));
		const layers = {
			OCGs: [listed],
			D: {
				ON: [listed, stray],
				Order: [stray, listed, [PDFString.of('B'), stray]],
				RBGroups: loop.get(1),
				AS: [{ Event: 'View', Category: ['View'], OCGs: [stray, listed] }]
			}
		};
		catalog.set(PDFName.of('OCProperties'), context.obj(layers as never));
	});
	const listed = (under('catalog', 'OCProperties', 'OCGs') as PDFArray).get(0);
	const names = (...path: (string | number)[]) =>
		(under('catalog', 'OCProperties', 'D', ...path) as PDFArray).asArray();
	expect(names('ON')).toEqual([listed, PDFNull]);
	expect(names('Order').slice(0, 2)).toEqual([PDFNull, listed]);
	expect(names('Order', 2)).toEqual([PDFString.of('B'), PDFNull]);
	expect(names('RBGroups')).toEqual([listed, PDFNull]);
	expect(names('AS', 0, 'OCGs')).toEqual([PDFNull, listed]);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of an /OC and of an entry of /Properties a group or a membership dictionary, and of any other property list no key', async () => {
	const { keys, under, text } = await background((page, context, catalog) => {
		const listed = group(context, outside(context));
		catalog.set(PDFName.of('OCProperties'), context.obj({ OCGs: [listed], D: {} }));
		const stream = (keys: Record<string, unknown>) =>
			context.register(context.stream('x', keys as never));
		const resources = {
			Properties: {
				MC0: listed,
				MC1: {
					Type: 'OCMD',
					OCGs: listed,
					P: 'AnyOn',
					VE: ['Not', listed],
					...outside(context)
				},
				MC2: { MCID: 0, ...outside(context) },
				MC3: { Type: 'Pagination', Private: PDFString.of('PRIVATE') },
				MC4: context.register(context.stream('PRIVATE', { Type: 'OCG' }))
			},
			XObject: {
				Im0: stream({ Subtype: 'Image', Width: 1, Height: 1, OC: listed }),
				Fm0: stream({
					Subtype: 'Form',
					BBox: [0, 0, 1, 1],
					OC: { Type: 'OCMD', OCGs: [listed, group(context, outside(context))], P: hidden(context) }
				})
			}
		};
		page.set(PDFName.of('Resources'), context.obj(resources as never));
		page.set(PDFName.of('Annots'), context.obj([{ ...LINK, Dest: ['Fit'], OC: listed }]));
	});
	const listed = (under('catalog', 'OCProperties', 'OCGs') as PDFArray).get(0);
	const properties = ['page', 'Resources', 'Properties'] as const;
	expect(keys(...properties)).toEqual(['MC0', 'MC1', 'MC2', 'MC3']);
	expect((under(...properties) as PDFDict).get(PDFName.of('MC0'))).toBe(listed);
	expect(keys(...properties, 'MC0')).toEqual(['Name', 'Type']);
	expect(keys(...properties, 'MC1')).toEqual(['OCGs', 'P', 'Type', 'VE']);
	expect((under(...properties, 'MC1', 'VE') as PDFArray).asArray()).toEqual([
		PDFName.of('Not'),
		listed
	]);
	expect(keys(...properties, 'MC2')).toEqual([]);
	expect(keys(...properties, 'MC3')).toEqual([]);
	const xobjects = ['page', 'Resources', 'XObject'] as const;
	expect((under(...xobjects, 'Im0') as PDFStream).dict.get(PDFName.of('OC'))).toBe(listed);
	expect(keys(...xobjects, 'Fm0', 'OC')).toEqual(['OCGs', 'Type']);
	expect((under(...xobjects, 'Fm0', 'OC', 'OCGs') as PDFArray).get(0)).toBe(listed);
	expect(keys(...xobjects, 'Fm0', 'OC', 'OCGs', 1)).toEqual(['Name', 'Type']);
	expect((under('page', 'Annots', 0) as PDFDict).get(PDFName.of('OC'))).toBe(listed);
	expect(text).not.toContain('PRIVATE');
});
