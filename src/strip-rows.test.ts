/**
 * Each row of the strip's table keeps its keys, and not the key a case plants
 * outside it. For every row and every entry of `PICK`, a file holds one object
 * of that kind where the walk reaches it, with every key of the row and one
 * key outside it, `/Sample`, which references a dictionary. The keys the
 * background has of it are held to a list written here, which the table does
 * not feed. A key that leaves a row fails its case. A key that joins one fails
 * only as `/Sample` kept whole: no case plants a key of another name, and a
 * row that lists `/Sample` bare keeps no dictionary under it.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNull,
	PDFObject,
	PDFStream,
	PDFString
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

type Planted = Record<string, unknown>;
class Stream {}
const stream = (keys: Planted): Planted => Object.assign(new Stream(), keys);
/** Where a planted value is a reference to an object nothing should reach, which says so in the bytes. */
const OUT = Symbol('outside');
/** Where a planted value is a reference to the page. */
const PAGE = Symbol('page');
/** Where a planted value is a reference to the file's one optional content group, the same wherever a case writes it. */
const LAYER = Symbol('layer');
/** Where a planted value is a reference to the file's one structure element, the same wherever a case writes it. */
const TAG = Symbol('tag');
/** Where a planted value is a reference to a link, which the page then lists. */
const A_LINK = Symbol('link');

/** The dictionaries of each file that a case can be: the rest hang on the page. */
const ROOTS = {
	catalog: (catalog: PDFDict) => catalog,
	node: (_: PDFDict, page: PDFDict) => page.lookup(PDFName.of('Parent'), PDFDict),
	page: (_: PDFDict, page: PDFDict) => page
};

interface Case {
	kind: string;
	/** The dictionary of the file that is the object. */
	on?: keyof typeof ROOTS;
	/** What the page holds, or the dictionary `on` names, with the object in it. */
	at?: (object: unknown) => Planted;
	/** Every key of the row, or every position. A list with `Length` in it is a stream's. */
	keeps: string;
	/** The value of each key that leads somewhere or is read. Any other key holds 0. */
	has?: Planted;
	/** The key `PICK` reads, and each value that picks this row. */
	pick?: [key: string, ...told: (string | number)[]];
}

const DATA = stream({ Sample: OUT });
const PARMS = { Columns: 1, Sample: OUT };
const RESOURCES = { ProcSet: ['PDF'], Sample: OUT };
const ICC = stream({ N: 1, Sample: OUT });
const SPACE = ['ICCBased', ICC];
const FUNCTION = { FunctionType: 2, N: 1, Sample: OUT };
const GROUP = { S: 'Transparency', Sample: OUT };
const IMAGE = stream({ Subtype: 'Image', Width: 1, Height: 1, Sample: OUT });
const FORM = stream({ Subtype: 'Form', BBox: [0, 0, 1, 1], Sample: OUT });
const FONT = { Subtype: 'Type1', BaseFont: 'A', Sample: OUT };
const DESCRIPTOR = { FontName: 'A', Sample: OUT };
const ENCODING = { Differences: [0, 'a'], Sample: OUT };
const CMAP = stream({ CMapName: 'A', Sample: OUT });
const SYSTEM = { Registry: PDFString.of('A'), Sample: OUT };
const FILE = stream({ Length1: 1, Sample: OUT });
const LINK = { Subtype: 'Link', Rect: [0, 0, 1, 1] };
const STATE = { Subtype: 'A', Sample: OUT };
const ADDRESS = PDFString.of('https://example.com/');

const inAnnots = (object: unknown) => ({ Annots: [object] });
const inAction = (object: unknown) => ({ Annots: [{ ...LINK, A: object }] });
const inResources = (map: string) => (object: unknown) => ({ Resources: { [map]: { X: object } } });
const inFont = (key: string) => (object: unknown) =>
	inResources('Font')({ Subtype: 'Type1', [key]: object });
const inLayers = (config: Planted) => ({ OCProperties: { OCGs: [LAYER], D: config } });
const inFunction = (object: unknown) =>
	inResources('Shading')({ ShadingType: 2, Function: object });
const inTags = (root: Planted) => ({ StructTreeRoot: { K: [TAG], ...root } });
const inElement = (key: string) => (object: unknown) =>
	inTags({ K: [TAG, { S: 'P', [key]: object }] });

const CODED = 'Length Filter DecodeParms';
const LINKED = 'Type Subtype Rect Border BS C H QuadPoints F OC Contents StructParent';
const SHADED = 'ShadingType ColorSpace Background BBox AntiAlias';

const listed = (keeps: string) => keeps.split(' ').filter(Boolean);

const CASES: Case[] = [
	{ kind: 'catalog', on: 'catalog', keeps: 'Type Pages OCProperties StructTreeRoot MarkInfo Lang' },
	{
		kind: 'tree',
		on: 'node',
		keeps: 'Type Parent Kids Count Resources Rotate',
		has: { Resources: RESOURCES },
		pick: ['Type', 'Pages']
	},
	{
		kind: 'page',
		on: 'page',
		keeps: 'Type Parent Resources MediaBox Contents Rotate Group StructParents Tabs Annots',
		has: {
			Resources: RESOURCES,
			Contents: [DATA],
			Group: GROUP,
			Annots: [{ ...LINK, Dest: ['Fit'], Sample: OUT }]
		},
		pick: ['Type', 'Page']
	},
	{
		kind: 'link with an action',
		at: inAnnots,
		keeps: `${LINKED} A`,
		has: { ...LINK, Type: 'Annot', A: { S: 'URI', URI: ADDRESS, Sample: OUT } }
	},
	{
		kind: 'link with a destination',
		at: inAnnots,
		keeps: `${LINKED} Dest`,
		has: { ...LINK, Type: 'Annot', Dest: ['Fit'] }
	},
	{
		kind: 'border',
		at: (object) => inAnnots({ ...LINK, Dest: ['Fit'], BS: object }),
		keeps: 'Type W S D'
	},
	{
		kind: 'dest',
		at: (object) => inAnnots({ ...LINK, Dest: object }),
		keeps: '0 1 2 3 4 5',
		has: { 0: PAGE }
	},
	{ kind: 'uri', at: inAction, keeps: 'S URI', has: { URI: ADDRESS }, pick: ['S', 'URI'] },
	{ kind: 'goto', at: inAction, keeps: 'S D', has: { D: ['Fit'] }, pick: ['S', 'GoTo'] },
	{
		kind: 'resources',
		at: (object) => ({ Resources: object }),
		keeps: 'Font XObject ExtGState ColorSpace Pattern Shading Properties ProcSet',
		has: {
			Font: {},
			XObject: {},
			ExtGState: {},
			ColorSpace: {},
			Pattern: {},
			Shading: {},
			Properties: {}
		}
	},
	{ kind: 'content', at: (object) => ({ Contents: object }), keeps: CODED },
	{
		kind: 'image',
		at: inResources('XObject'),
		keeps:
			'Type Subtype Width Height BitsPerComponent ColorSpace Decode ImageMask Mask SMask ' +
			`SMaskInData Matte Interpolate Intent OC StructParent ${CODED}`,
		has: { ColorSpace: SPACE, Mask: IMAGE, SMask: IMAGE },
		pick: ['Subtype', 'Image']
	},
	{
		kind: 'form',
		at: inResources('XObject'),
		keeps: `Type Subtype FormType BBox Matrix Resources Group OC StructParent StructParents ${CODED}`,
		has: { Resources: RESOURCES, Group: GROUP },
		pick: ['Subtype', 'Form']
	},
	{
		kind: 'parms',
		at: (object) => ({ Contents: stream({ Filter: 'FlateDecode', DecodeParms: object }) }),
		keeps:
			'Predictor Colors BitsPerComponent Columns EarlyChange K EndOfLine EncodedByteAlign Rows ' +
			'EndOfBlock BlackIs1 DamagedRowsBeforeError ColorTransform JBIG2Globals',
		has: { JBIG2Globals: DATA }
	},
	{
		kind: 'data',
		at: (object) => ({
			Contents: stream({ Filter: 'JBIG2Decode', DecodeParms: { JBIG2Globals: object } })
		}),
		keeps: CODED
	},
	{
		kind: 'group',
		at: (object) => ({ Group: object }),
		keeps: 'Type S CS I K',
		has: { CS: SPACE }
	},
	{
		kind: 'gstate',
		at: inResources('ExtGState'),
		keeps:
			'Type LW LC LJ ML D RI OP op OPM Font BG BG2 UCR UCR2 TR TR2 HT HTO FL SM SA BM SMask CA ' +
			'ca AIS TK UseBlackPtComp',
		has: {
			Font: [FONT, 1],
			BG: FUNCTION,
			BG2: FUNCTION,
			UCR: FUNCTION,
			UCR2: FUNCTION,
			TR: [FUNCTION],
			TR2: [FUNCTION],
			SMask: { S: 'Alpha', G: FORM, Sample: OUT }
		}
	},
	{
		kind: 'fontsize',
		at: (object) => inResources('ExtGState')({ Font: object }),
		keeps: '0 1',
		has: { 0: FONT }
	},
	{
		kind: 'mask',
		at: (object) => inResources('ExtGState')({ SMask: object }),
		keeps: 'Type S G BC TR',
		has: { G: FORM, TR: FUNCTION }
	},
	{
		kind: 'ICCBased',
		at: inResources('ColorSpace'),
		keeps: '0 1',
		has: { 1: ICC },
		pick: ['0', 'ICCBased']
	},
	{
		kind: 'Indexed',
		at: inResources('ColorSpace'),
		keeps: '0 1 2 3',
		has: { 1: SPACE, 3: DATA },
		pick: ['0', 'Indexed']
	},
	{
		kind: 'Separation and DeviceN',
		at: inResources('ColorSpace'),
		keeps: '0 1 2 3',
		has: { 2: SPACE, 3: FUNCTION },
		pick: ['0', 'Separation', 'DeviceN']
	},
	{
		kind: 'CalRGB, CalGray and Lab',
		at: inResources('ColorSpace'),
		keeps: '0 1',
		has: { 1: { WhitePoint: [1, 1, 1], Sample: OUT } },
		pick: ['0', 'CalRGB', 'CalGray', 'Lab']
	},
	{
		kind: 'Pattern',
		at: inResources('ColorSpace'),
		keeps: '0 1',
		has: { 1: SPACE },
		pick: ['0', 'Pattern']
	},
	{
		kind: 'icc',
		at: (object) => inResources('ColorSpace')(['ICCBased', object]),
		keeps: `N Alternate Range ${CODED}`,
		has: { Alternate: SPACE }
	},
	{
		kind: 'cie',
		at: (object) => inResources('ColorSpace')(['CalRGB', object]),
		keeps: 'WhitePoint BlackPoint Gamma Matrix Range'
	},
	{
		kind: 'function0',
		at: inFunction,
		keeps: `FunctionType Domain Range Size BitsPerSample Order Encode Decode ${CODED}`,
		pick: ['FunctionType', 0]
	},
	{
		kind: 'function2',
		at: inFunction,
		keeps: 'FunctionType Domain Range C0 C1 N',
		pick: ['FunctionType', 2]
	},
	{
		kind: 'function3',
		at: inFunction,
		keeps: 'FunctionType Domain Range Functions Bounds Encode',
		has: { Functions: [FUNCTION] },
		pick: ['FunctionType', 3]
	},
	{
		kind: 'function4',
		at: inFunction,
		keeps: `FunctionType Domain Range ${CODED}`,
		pick: ['FunctionType', 4]
	},
	{
		kind: 'shaded',
		at: inResources('Shading'),
		keeps: `${SHADED} Domain Matrix Coords Extend Function`,
		has: { ColorSpace: SPACE, Function: [FUNCTION] },
		pick: ['ShadingType', 1, 2, 3]
	},
	{
		kind: 'mesh',
		at: inResources('Shading'),
		keeps:
			`${SHADED} BitsPerCoordinate BitsPerComponent BitsPerFlag Decode VerticesPerRow ` +
			`Function ${CODED}`,
		has: { ColorSpace: SPACE, Function: [FUNCTION] },
		pick: ['ShadingType', 4, 5, 6, 7]
	},
	{
		kind: 'tiling',
		at: inResources('Pattern'),
		keeps: `Type PatternType PaintType TilingType BBox XStep YStep Resources Matrix ${CODED}`,
		has: { Resources: RESOURCES },
		pick: ['PatternType', 1]
	},
	{
		kind: 'shadingpattern',
		at: inResources('Pattern'),
		keeps: 'Type PatternType Shading Matrix ExtGState',
		has: { Shading: { ShadingType: 2, Sample: OUT }, ExtGState: { CA: 1, Sample: OUT } },
		pick: ['PatternType', 2]
	},
	{
		kind: 'simple',
		at: inResources('Font'),
		keeps: 'Type Subtype Name BaseFont FirstChar LastChar Widths FontDescriptor Encoding ToUnicode',
		has: { FontDescriptor: DESCRIPTOR, Encoding: ENCODING, ToUnicode: CMAP },
		pick: ['Subtype', 'Type1', 'MMType1', 'TrueType']
	},
	{
		kind: 'type3',
		at: inResources('Font'),
		keeps:
			'Type Subtype Name FontBBox FontMatrix CharProcs Encoding FirstChar LastChar Widths ' +
			'FontDescriptor Resources ToUnicode',
		has: {
			CharProcs: { a: DATA },
			Encoding: ENCODING,
			FontDescriptor: DESCRIPTOR,
			Resources: RESOURCES,
			ToUnicode: CMAP
		},
		pick: ['Subtype', 'Type3']
	},
	{
		kind: 'type0',
		at: inResources('Font'),
		keeps: 'Type Subtype BaseFont Encoding DescendantFonts ToUnicode',
		has: {
			Encoding: CMAP,
			DescendantFonts: [{ Subtype: 'CIDFontType2', Sample: OUT }],
			ToUnicode: CMAP
		},
		pick: ['Subtype', 'Type0']
	},
	{
		kind: 'cidfont',
		at: (object) => inResources('Font')({ Subtype: 'Type0', DescendantFonts: [object] }),
		keeps: 'Type Subtype BaseFont CIDSystemInfo FontDescriptor DW W DW2 W2 CIDToGIDMap',
		has: { CIDSystemInfo: SYSTEM, FontDescriptor: DESCRIPTOR, CIDToGIDMap: DATA },
		pick: ['Subtype', 'CIDFontType0', 'CIDFontType2']
	},
	{
		kind: 'cidsystem',
		at: (object) => inFont('ToUnicode')(stream({ CIDSystemInfo: object })),
		keeps: 'Registry Ordering Supplement'
	},
	{ kind: 'encoding', at: inFont('Encoding'), keeps: 'Type BaseEncoding Differences' },
	{
		kind: 'cmap',
		at: inFont('ToUnicode'),
		keeps: `Type CMapName CIDSystemInfo WMode UseCMap ${CODED}`,
		has: { CIDSystemInfo: SYSTEM, UseCMap: CMAP }
	},
	{
		kind: 'descriptor',
		at: inFont('FontDescriptor'),
		keeps:
			'Type FontName FontFamily FontStretch FontWeight Flags FontBBox ItalicAngle Ascent Descent ' +
			'Leading CapHeight XHeight StemV StemH AvgWidth MaxWidth MissingWidth CharSet Lang ' +
			'FontFile FontFile2 FontFile3 CIDSet',
		has: { FontFile: FILE, FontFile2: FILE, FontFile3: FILE, CIDSet: DATA }
	},
	{
		kind: 'fontfile',
		at: (object) => inFont('FontDescriptor')({ FontFile2: object }),
		keeps: `Subtype Length1 Length2 Length3 ${CODED}`
	},
	{
		kind: 'layers',
		on: 'catalog',
		at: (object) => ({ OCProperties: object }),
		keeps: 'OCGs D',
		has: { OCGs: [LAYER], D: { Sample: OUT } }
	},
	{
		kind: 'config',
		on: 'catalog',
		at: (object) => inLayers(object as Planted),
		keeps: 'Name BaseState ON OFF Intent AS Order ListMode RBGroups Locked',
		has: {
			ON: [LAYER],
			OFF: [LAYER],
			AS: [{ Event: 'View', Sample: OUT }],
			Order: [LAYER],
			RBGroups: [[LAYER]],
			Locked: [LAYER]
		}
	},
	{
		kind: 'auto',
		on: 'catalog',
		at: (object) => inLayers({ AS: [object] }),
		keeps: 'Event Category OCGs',
		has: { OCGs: [LAYER] }
	},
	{
		kind: 'ocg',
		at: inResources('Properties'),
		keeps: 'Type Name Intent Usage',
		has: { Usage: { Sample: OUT } },
		pick: ['Type', 'OCG']
	},
	{
		kind: 'usage',
		at: (object) => inResources('Properties')({ Type: 'OCG', Usage: object }),
		keeps: 'Print View Export PageElement',
		has: { Print: STATE, View: STATE, Export: STATE, PageElement: STATE }
	},
	{
		kind: 'state',
		at: (object) => inResources('Properties')({ Type: 'OCG', Usage: { View: object } }),
		keeps: 'Subtype PrintState ViewState ExportState'
	},
	{
		kind: 'ocmd',
		at: inResources('Properties'),
		keeps: 'Type OCGs P VE',
		has: { OCGs: [LAYER], VE: ['Not', LAYER] },
		pick: ['Type', 'OCMD']
	},
	{ kind: 'marked', at: inResources('Properties'), keeps: '' },
	{
		kind: 'marks',
		on: 'catalog',
		at: (object) => ({ MarkInfo: object }),
		keeps: 'Marked Suspects'
	},
	{
		kind: 'tags',
		on: 'catalog',
		at: (object) => ({ StructTreeRoot: object }),
		keeps: 'Type K IDTree ParentTree ParentTreeNextKey RoleMap ClassMap',
		has: {
			K: [TAG],
			IDTree: { Sample: OUT },
			ParentTree: { Sample: OUT },
			RoleMap: { A: 'P' },
			ClassMap: { A: [{ O: 'Layout', Sample: OUT }] }
		}
	},
	{
		kind: 'elem',
		on: 'catalog',
		at: (object) => inTags({ K: [TAG, object] }),
		keeps: 'Type S P ID Pg K A C T Lang Alt E ActualText',
		has: { P: TAG, Pg: PAGE, K: [{ S: 'P', Sample: OUT }], A: [{ O: 'Layout', Sample: OUT }] },
		pick: ['Type', 'StructElem', 'Sect']
	},
	{
		kind: 'mcr',
		on: 'catalog',
		at: inElement('K'),
		keeps: 'Type Pg MCID',
		has: { Pg: PAGE },
		pick: ['Type', 'MCR']
	},
	{
		kind: 'objr',
		on: 'catalog',
		at: inElement('K'),
		keeps: 'Type Pg Obj',
		has: { Pg: PAGE, Obj: A_LINK },
		pick: ['Type', 'OBJR']
	},
	{
		kind: 'attributes',
		on: 'catalog',
		at: inElement('A'),
		keeps:
			'O Headers Scope ColSpan RowSpan Summary BBox Width Height Placement BackgroundColor ' +
			'BorderColor BorderStyle BorderThickness SpaceBefore SpaceAfter StartIndent EndIndent ' +
			'TextIndent TextAlign BlockAlign InlineAlign BaselineShift LineHeight TextDecorationColor ' +
			'TextDecorationThickness TextDecorationType ColumnCount ColumnGap ColumnWidths ' +
			'ListNumbering Role checked ADBE_MinWidth'
	},
	{
		kind: 'parents',
		on: 'catalog',
		at: (object) => inTags({ ParentTree: object }),
		keeps: 'Kids Nums Limits',
		has: { Kids: [{ Nums: [0, TAG], Sample: OUT }], Nums: [0, [TAG]] }
	},
	{
		kind: 'ids',
		on: 'catalog',
		at: (object) => inTags({ IDTree: object }),
		keeps: 'Kids Names Limits',
		has: {
			Kids: [{ Names: [PDFString.of('A'), TAG], Sample: OUT }],
			Names: [PDFString.of('A'), TAG]
		}
	}
];

/** The keys the background has of a case's object, or of an array the positions that are not null, and the background's bytes. */
async function background({ on, at, keeps, has = {}, pick }: Case, told?: string | number) {
	const source = await PDFDocument.create();
	const { context } = source;
	const { node: page, ref } = source.addPage([612, 792]);
	// The page hangs under a page tree node of its own, which the walk picks from /Kids.
	const tree = source.catalog.Pages();
	const node = context.register(
		context.obj({
			Type: 'Pages',
			Parent: source.catalog.get(PDFName.of('Pages')),
			Kids: tree.get(PDFName.of('Kids')),
			Count: 1
		})
	);
	tree.set(PDFName.of('Kids'), context.obj([node]));
	page.set(PDFName.of('Parent'), node);

	const holder = ROOTS[on ?? 'page'](source.catalog, page);
	const names = listed(keeps).filter((key) => key !== 'Length');
	const held = { Filter: 'FlateDecode', DecodeParms: [PARMS], ...has } as Planted;
	if (pick) held[pick[0]] = told;
	const value = (key: string) => held[key] ?? (at ? undefined : holder.get(PDFName.of(key))) ?? 0;
	const object = /^\d/.test(keeps)
		? [...names.map(value), OUT]
		: Object.assign(names.length < listed(keeps).length ? new Stream() : {}, {
				...Object.fromEntries(names.map((key) => [key, value(key)])),
				Sample: OUT
			});

	let path: (string | number)[] = [];
	let layer: PDFObject | undefined;
	let tag: PDFObject | undefined;
	const made = (planted: unknown, trail: (string | number)[]): PDFObject => {
		if (planted === object) path = trail;
		if (planted === PAGE) return ref;
		if (planted === LAYER)
			return (layer ??= context.register(context.obj({ Type: 'OCG', Sample: made(OUT, []) })));
		if (planted === TAG)
			return (tag ??= context.register(context.obj({ S: 'P', Sample: made(OUT, []) })));
		if (planted === A_LINK) {
			const link = context.register(context.obj({ ...LINK, Dest: ['Fit'] }));
			page.set(PDFName.of('Annots'), context.obj([link]));
			return link;
		}
		if (planted === OUT) return context.register(context.obj({ Private: PDFString.of('PRIVATE') }));
		if (Array.isArray(planted))
			return context.obj(planted.map((part, index) => made(part, [...trail, index])));
		if (planted instanceof PDFObject || typeof planted !== 'object')
			return context.obj(planted as never);
		const dict = Object.fromEntries(
			Object.entries(planted as Planted).map(([key, part]) => [key, made(part, [...trail, key])])
		);
		return planted instanceof Stream
			? context.register(context.stream('x', dict))
			: context.obj(dict);
	};
	for (const [key, planted] of Object.entries(at ? at(object) : object))
		holder.set(PDFName.of(key), made(planted, [key]));

	const saved = await source.save({ useObjectStreams: false });
	const bytes = await stripAcroForm(saved, await viewsOf(saved, [[0, 0, 612, 792]]));
	const doc = await PDFDocument.load(bytes);
	const dict = (held: PDFObject | undefined) => (held instanceof PDFStream ? held.dict : held);
	let found: PDFObject | undefined = ROOTS[on ?? 'page'](doc.catalog, doc.getPage(0).node);
	for (const key of path) {
		const within = dict(found);
		found =
			within instanceof PDFArray
				? within.lookup(key as number)
				: (within as PDFDict).lookup(PDFName.of(String(key)));
	}
	const keys =
		found instanceof PDFArray
			? found.asArray().flatMap((part, index) => (part === PDFNull ? [] : [String(index)]))
			: (dict(found) as PDFDict).keys().map((key) => key.decodeText());
	return { keys: keys.sort(), text: new TextDecoder('latin1').decode(bytes) };
}

for (const row of CASES)
	for (const told of row.pick?.slice(1) ?? [undefined])
		it(`${row.kind}${told === undefined ? '' : `, told by ${told}`}: the background keeps every key of the row and not /Sample`, async () => {
			const { keys, text } = await background(row, told);
			expect(keys).toEqual(listed(row.keeps).sort());
			expect(text).not.toContain('/Sample');
			expect(text).not.toContain('PRIVATE');
		});
