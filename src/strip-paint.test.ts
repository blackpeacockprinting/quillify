/**
 * Everything a page's /Resources reaches is told its kind and keeps the keys of
 * that kind: a font and what describes it, a graphics state and its mask, a
 * transparency group, a color space, a function, a shading and a pattern.
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
	type PDFObject
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

type Planted = Record<string, unknown>;

type Plant = (context: PDFContext, page: PDFDict) => Planted;

/** What the strip makes of one 612 by 792 page, with what `plant` gives it as /Resources. */
async function stripped(plant: Plant) {
	const source = await PDFDocument.create();
	const node = source.addPage([612, 792]).node;
	node.set(PDFName.of('Resources'), source.context.obj(plant(source.context, node) as never));
	const saved = await source.save({ useObjectStreams: false });
	return stripAcroForm(saved, await viewsOf(saved, [[0, 0, 612, 792]]));
}

/** The background of that page. */
async function background(plant: Plant) {
	const bytes = await stripped(plant);
	const doc = await PDFDocument.load(bytes);
	const page = doc.getPage(0).node;
	/** What the page's resources hold along a path of names and positions, read through references. */
	const under = (...path: (string | number)[]) =>
		path.reduce<PDFObject | undefined>(
			(held, key) => {
				const dict = held instanceof PDFStream ? held.dict : held;
				if (dict instanceof PDFArray) return dict.lookup(key as number);
				return dict instanceof PDFDict ? dict.lookup(PDFName.of(String(key))) : undefined;
			},
			page.lookup(PDFName.of('Resources'))
		);
	/** The keys of the dictionary at a path, or of the stream's dictionary there. */
	const keys = (...path: (string | number)[]) => {
		const held = under(...path);
		const dict = held instanceof PDFStream ? held.dict : (held as PDFDict);
		return dict
			.keys()
			.map((key) => key.decodeText())
			.sort();
	};
	return { page, under, keys, text: new TextDecoder('latin1').decode(bytes) };
}

/** A key no row lists, on an object nothing should reach, that says so in the bytes. */
const outside = (context: PDFContext) => ({
	Sample: context.register(context.obj({ Private: PDFString.of('PRIVATE') }))
});

const DESCRIPTOR = { Type: 'FontDescriptor', FontName: 'Sample', Flags: 4 };
const FUNCTION = { FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 };

it('keeps of a simple font, its encoding, its descriptor, its font file and its CMap the keys of each', async () => {
	const { keys, text } = await background((context) => ({
		Font: {
			F1: context.register(
				context.obj({
					Type: 'Font',
					Subtype: 'TrueType',
					BaseFont: 'Sample',
					FirstChar: 32,
					LastChar: 32,
					Widths: [500],
					Encoding: { Type: 'Encoding', Differences: [32, 'space'], ...outside(context) },
					FontDescriptor: context.register(
						context.obj({
							...DESCRIPTOR,
							FontFile2: context.register(
								context.stream('x', { Length1: 1, Metadata: {}, ...outside(context) })
							),
							Style: { Panose: PDFString.of('x') },
							...outside(context)
						})
					),
					ToUnicode: context.register(context.stream('x', outside(context))),
					...outside(context)
				})
			),
			F2: context.register(context.obj({ Type: 'Font', Subtype: 'Sample', ...outside(context) }))
		}
	}));
	expect(keys('Font')).toEqual(['F1']);
	expect(keys('Font', 'F1')).toEqual([
		'BaseFont',
		'Encoding',
		'FirstChar',
		'FontDescriptor',
		'LastChar',
		'Subtype',
		'ToUnicode',
		'Type',
		'Widths'
	]);
	expect(keys('Font', 'F1', 'Encoding')).toEqual(['Differences', 'Type']);
	expect(keys('Font', 'F1', 'FontDescriptor')).toEqual(['Flags', 'FontFile2', 'FontName', 'Type']);
	expect(keys('Font', 'F1', 'FontDescriptor', 'FontFile2')).toEqual(['Length', 'Length1']);
	expect(keys('Font', 'F1', 'ToUnicode')).toEqual(['Length']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a Type 0 font, its CMap and its descendant the keys of each', async () => {
	const { keys, text } = await background((context) => {
		const system = { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity') };
		return {
			Font: {
				F1: context.register(
					context.obj({
						Type: 'Font',
						Subtype: 'Type0',
						BaseFont: 'Sample',
						Encoding: context.register(
							context.stream('x', {
								Type: 'CMap',
								CMapName: 'Sample',
								CIDSystemInfo: { ...system, Supplement: 0, ...outside(context) },
								UseCMap: context.register(context.stream('x', outside(context))),
								...outside(context)
							})
						),
						DescendantFonts: [
							context.register(
								context.obj({
									Type: 'Font',
									Subtype: 'CIDFontType2',
									BaseFont: 'Sample',
									CIDSystemInfo: { ...system, Supplement: 0 },
									FontDescriptor: context.register(context.obj(DESCRIPTOR)),
									W: [0, [500, 500]],
									CIDToGIDMap: context.register(context.stream('x', outside(context))),
									FontInfo: { FSType: 8 },
									...outside(context)
								})
							)
						],
						Bezier: true,
						...outside(context)
					})
				)
			}
		};
	});
	expect(keys('Font', 'F1')).toEqual([
		'BaseFont',
		'DescendantFonts',
		'Encoding',
		'Subtype',
		'Type'
	]);
	expect(keys('Font', 'F1', 'Encoding')).toEqual([
		'CIDSystemInfo',
		'CMapName',
		'Length',
		'Type',
		'UseCMap'
	]);
	expect(keys('Font', 'F1', 'Encoding', 'CIDSystemInfo')).toEqual([
		'Ordering',
		'Registry',
		'Supplement'
	]);
	expect(keys('Font', 'F1', 'Encoding', 'UseCMap')).toEqual(['Length']);
	expect(keys('Font', 'F1', 'DescendantFonts', 0)).toEqual([
		'BaseFont',
		'CIDSystemInfo',
		'CIDToGIDMap',
		'FontDescriptor',
		'Subtype',
		'Type',
		'W'
	]);
	expect(keys('Font', 'F1', 'DescendantFonts', 0, 'CIDToGIDMap')).toEqual(['Length']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a Type 3 font its glyphs and their resources, and of each the keys of its kind', async () => {
	const { keys, text } = await background((context) => ({
		Font: {
			F1: context.register(
				context.obj({
					Type: 'Font',
					Subtype: 'Type3',
					FontBBox: [0, 0, 1, 1],
					FontMatrix: [1, 0, 0, 1, 0, 0],
					CharProcs: {
						a: context.register(context.stream('0 0 d0', { F: PDFString.of('PRIVATE.bin') })),
						b: context.register(context.obj({ Private: PDFString.of('PRIVATE') }))
					},
					Encoding: { Type: 'Encoding', Differences: [0, 'a'] },
					FirstChar: 0,
					LastChar: 0,
					Widths: [1],
					Resources: { ProcSet: ['PDF'], ...outside(context) },
					...outside(context)
				})
			)
		}
	}));
	expect(keys('Font', 'F1')).toEqual([
		'CharProcs',
		'Encoding',
		'FirstChar',
		'FontBBox',
		'FontMatrix',
		'LastChar',
		'Resources',
		'Subtype',
		'Type',
		'Widths'
	]);
	expect(keys('Font', 'F1', 'CharProcs')).toEqual(['a']);
	expect(keys('Font', 'F1', 'CharProcs', 'a')).toEqual(['Length']);
	expect(keys('Font', 'F1', 'Resources')).toEqual(['ProcSet']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a graphics state, its soft mask and the group it paints the keys of each', async () => {
	const { keys, under, text } = await background((context) => {
		const font = context.register(
			context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Courier' })
		);
		return {
			ExtGState: {
				G1: context.register(
					context.obj({
						Type: 'ExtGState',
						CA: 1,
						D: [[3, 1], 0],
						Font: [font, 12, context.register(context.obj({ Private: PDFString.of('PRIVATE') }))],
						TR2: context.register(context.obj({ ...FUNCTION, ...outside(context) })),
						HT: { HalftoneType: 1, ...outside(context) },
						SMask: {
							Type: 'Mask',
							S: 'Luminosity',
							G: context.register(
								context.stream('q Q', {
									Type: 'XObject',
									Subtype: 'Form',
									BBox: [0, 0, 1, 1],
									Group: {
										Type: 'Group',
										S: 'Transparency',
										CS: 'DeviceGray',
										...outside(context)
									},
									PieceInfo: outside(context)
								})
							),
							TR: 'Identity',
							...outside(context)
						},
						...outside(context)
					})
				)
			}
		};
	});
	expect(keys('ExtGState', 'G1')).toEqual(['CA', 'D', 'Font', 'SMask', 'TR2', 'Type']);
	expect((under('ExtGState', 'G1', 'Font') as PDFArray).size()).toBe(2);
	expect(keys('ExtGState', 'G1', 'Font', 0)).toEqual(['BaseFont', 'Subtype', 'Type']);
	expect(keys('ExtGState', 'G1', 'TR2')).toEqual(['C0', 'C1', 'Domain', 'FunctionType', 'N']);
	expect(keys('ExtGState', 'G1', 'SMask')).toEqual(['G', 'S', 'TR', 'Type']);
	expect(keys('ExtGState', 'G1', 'SMask', 'G')).toEqual([
		'BBox',
		'Group',
		'Length',
		'Subtype',
		'Type'
	]);
	expect(keys('ExtGState', 'G1', 'SMask', 'G', 'Group')).toEqual(['CS', 'S', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it("keeps of a page's group and of a form's the keys of a transparency group", async () => {
	const { page, keys, text } = await background((context, node) => {
		const group = () => ({ Type: 'Group', S: 'Transparency', I: true, ...outside(context) });
		node.set(PDFName.of('Group'), context.obj(group()));
		return {
			XObject: {
				Fm0: context.register(
					context.stream('q Q', {
						Type: 'XObject',
						Subtype: 'Form',
						BBox: [0, 0, 1, 1],
						Group: group()
					})
				)
			}
		};
	});
	const kept = page
		.lookup(PDFName.of('Group'), PDFDict)
		.keys()
		.map((key) => key.decodeText());
	expect(kept.sort()).toEqual(['I', 'S', 'Type']);
	expect(keys('XObject', 'Fm0', 'Group')).toEqual(['I', 'S', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a color space the parts its family has, each by its position, and none past the last', async () => {
	const { keys, under, text } = await background((context) => {
		const stray = () => context.register(context.obj({ Private: PDFString.of('PRIVATE') }));
		const profile = context.register(
			context.stream('x', {
				N: 3,
				Alternate: 'DeviceRGB',
				Metadata: context.register(context.stream('PRIVATE')),
				...outside(context)
			})
		);
		const tint = context.register(context.obj({ ...FUNCTION, ...outside(context) }));
		return {
			ColorSpace: {
				Name: 'DeviceRGB',
				Icc: ['ICCBased', profile, stray()],
				Indexed: [
					'Indexed',
					['ICCBased', profile],
					1,
					context.register(context.stream('x', outside(context)))
				],
				Spot: ['Separation', 'Sample', 'DeviceCMYK', tint],
				Flat: ['Separation', 'Sample', 'DeviceCMYK', stray()],
				Inks: ['DeviceN', ['Sample'], 'DeviceCMYK', tint, { Subtype: 'DeviceN', Sample: stray() }],
				Cal: ['CalRGB', { WhitePoint: [1, 1, 1], ...outside(context) }],
				Tiled: ['Pattern', ['ICCBased', profile]],
				Other: ['Sample', stray()],
				Dict: { Private: PDFString.of('PRIVATE') }
			},
			XObject: {
				Im0: context.register(
					context.stream('x', {
						Type: 'XObject',
						Subtype: 'Image',
						Width: 1,
						Height: 1,
						BitsPerComponent: 8,
						ColorSpace: ['ICCBased', profile]
					})
				)
			}
		};
	});
	expect(keys('ColorSpace')).toEqual([
		'Cal',
		'Flat',
		'Icc',
		'Indexed',
		'Inks',
		'Name',
		'Spot',
		'Tiled'
	]);
	expect(keys('ColorSpace', 'Icc', 1)).toEqual(['Alternate', 'Length', 'N']);
	expect((under('ColorSpace', 'Icc') as PDFArray).size()).toBe(2);
	expect(keys('ColorSpace', 'Indexed', 1, 1)).toEqual(['Alternate', 'Length', 'N']);
	expect(keys('ColorSpace', 'Indexed', 3)).toEqual(['Length']);
	expect(keys('ColorSpace', 'Spot', 3)).toEqual(['C0', 'C1', 'Domain', 'FunctionType', 'N']);
	expect(keys('ColorSpace', 'Inks', 3)).toEqual(['C0', 'C1', 'Domain', 'FunctionType', 'N']);
	expect((under('ColorSpace', 'Inks') as PDFArray).size()).toBe(4);
	expect(under('ColorSpace', 'Flat', 3)).toBe(PDFNull);
	expect(keys('ColorSpace', 'Cal', 1)).toEqual(['WhitePoint']);
	expect(keys('ColorSpace', 'Tiled', 1, 1)).toEqual(['Alternate', 'Length', 'N']);
	expect(keys('XObject', 'Im0', 'ColorSpace', 1)).toEqual(['Alternate', 'Length', 'N']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a function the keys of its type, and no function of another type', async () => {
	const { keys, under, text } = await background((context) => {
		const sampled = context.register(
			context.stream('x', {
				FunctionType: 0,
				Domain: [0, 1],
				Range: [0, 1],
				Size: [2],
				BitsPerSample: 8,
				...outside(context)
			})
		);
		const written = context.register(
			context.stream('{ }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1], ...outside(context) })
		);
		const stitched = {
			FunctionType: 3,
			Domain: [0, 1],
			Functions: [sampled, written, { ...FUNCTION, ...outside(context) }, { FunctionType: 9 }],
			Bounds: [0.3, 0.6],
			Encode: [0, 1, 0, 1, 0, 1],
			...outside(context)
		};
		return { Shading: { Sh1: { ShadingType: 2, ColorSpace: 'DeviceGray', Function: stitched } } };
	});
	const stitched = ['Shading', 'Sh1', 'Function'] as const;
	expect(keys(...stitched)).toEqual(['Bounds', 'Domain', 'Encode', 'FunctionType', 'Functions']);
	expect((under(...stitched, 'Functions') as PDFArray).size()).toBe(3);
	expect(keys(...stitched, 'Functions', 0)).toEqual([
		'BitsPerSample',
		'Domain',
		'FunctionType',
		'Length',
		'Range',
		'Size'
	]);
	expect(keys(...stitched, 'Functions', 1)).toEqual(['Domain', 'FunctionType', 'Length', 'Range']);
	expect(keys(...stitched, 'Functions', 2)).toEqual(['C0', 'C1', 'Domain', 'FunctionType', 'N']);
	expect(text).not.toContain('PRIVATE');
});

it('keeps of a shading and of a pattern the keys of its type, which is a number', async () => {
	const { keys, text } = await background((context) => {
		const axial = () => ({
			ShadingType: 2,
			ColorSpace: 'DeviceGray',
			Coords: [0, 0, 1, 1],
			Function: FUNCTION,
			...outside(context)
		});
		return {
			Shading: {
				Sh1: axial(),
				Sh4: context.register(
					context.stream('x', {
						ShadingType: 4,
						ColorSpace: 'DeviceGray',
						BitsPerCoordinate: 8,
						BitsPerComponent: 8,
						BitsPerFlag: 8,
						Decode: [0, 1, 0, 1, 0, 1],
						...outside(context)
					})
				),
				Sh9: { ShadingType: 9, ...outside(context) },
				ShN: { ...axial(), ShadingType: PDFName.of('2') }
			},
			Pattern: {
				P1: context.register(
					context.stream('q Q', {
						Type: 'Pattern',
						PatternType: 1,
						PaintType: 1,
						TilingType: 1,
						BBox: [0, 0, 1, 1],
						XStep: 1,
						YStep: 1,
						Resources: { ProcSet: ['PDF'], ...outside(context) },
						...outside(context)
					})
				),
				P2: {
					Type: 'Pattern',
					PatternType: 2,
					Shading: axial(),
					ExtGState: { Type: 'ExtGState', CA: 1, ...outside(context) },
					...outside(context)
				},
				P9: { PatternType: 9, ...outside(context) }
			}
		};
	});
	expect(keys('Shading')).toEqual(['Sh1', 'Sh4']);
	expect(keys('Shading', 'Sh1')).toEqual(['ColorSpace', 'Coords', 'Function', 'ShadingType']);
	expect(keys('Shading', 'Sh4')).toEqual([
		'BitsPerComponent',
		'BitsPerCoordinate',
		'BitsPerFlag',
		'ColorSpace',
		'Decode',
		'Length',
		'ShadingType'
	]);
	expect(keys('Pattern')).toEqual(['P1', 'P2']);
	expect(keys('Pattern', 'P1')).toEqual([
		'BBox',
		'Length',
		'PaintType',
		'PatternType',
		'Resources',
		'TilingType',
		'Type',
		'XStep',
		'YStep'
	]);
	expect(keys('Pattern', 'P1', 'Resources')).toEqual(['ProcSet']);
	expect(keys('Pattern', 'P2')).toEqual(['ExtGState', 'PatternType', 'Shading', 'Type']);
	expect(keys('Pattern', 'P2', 'Shading')).toEqual([
		'ColorSpace',
		'Coords',
		'Function',
		'ShadingType'
	]);
	expect(keys('Pattern', 'P2', 'ExtGState')).toEqual(['CA', 'Type']);
	expect(text).not.toContain('PRIVATE');
});

it('refuses as damaged a file whose font the graphics states name too', async () => {
	const file = stripped((context) => {
		const both = context.register(
			context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Courier', CA: 1 })
		);
		return { Font: { F1: both }, ExtGState: { G1: both } };
	});
	await expect(file).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});

it.each<[name: string, plant: Plant]>([
	[
		'a CMap that is a font file too',
		(context) => {
			const both = context.register(context.stream('x', { Length1: 1 }));
			const font = { Type: 'Font', Subtype: 'TrueType', BaseFont: 'Sample' };
			const FontDescriptor = { ...DESCRIPTOR, FontFile2: both };
			return { Font: { F1: { ...font, ToUnicode: both, FontDescriptor } } };
		}
	],
	[
		'a color profile that is a function too',
		(context) => {
			const both = context.register(
				context.stream('x', { N: 1, FunctionType: 4, Domain: [0, 1], Range: [0, 1] })
			);
			const Spot = ['Separation', 'Sample', 'DeviceGray', both];
			return { ColorSpace: { Icc: ['ICCBased', both], Spot } };
		}
	],
	[
		'a shading that is a pattern too',
		(context) => {
			const both = context.register(
				context.obj({
					ShadingType: 2,
					PatternType: 2,
					ColorSpace: 'DeviceGray',
					Coords: [0, 0, 1, 1]
				})
			);
			return { Shading: { Sh1: both }, Pattern: { P1: both } };
		}
	]
])('refuses as damaged a file with %s', async (_, plant) => {
	await expect(stripped(plant)).rejects.toMatchObject({ refusal: { code: 'damaged' } });
});

it('refuses as damaged a file whose first page names its second page as its /Group', async () => {
	const source = await PDFDocument.create();
	const { context } = source;
	const first = source.addPage([612, 792]);
	const second = source.addPage([612, 792]);
	const tree = source.catalog.get(PDFName.of('Pages'));
	const inner = context.register(
		context.obj({ Type: 'Pages', Parent: tree, Kids: [second.ref], Count: 1 })
	);
	second.node.set(PDFName.of('Parent'), inner);
	source.catalog.Pages().set(PDFName.of('Kids'), context.obj([first.ref, inner]));
	first.node.set(PDFName.of('Group'), second.ref);
	const saved = await source.save({ useObjectStreams: false });
	const box: [number, number, number, number] = [0, 0, 612, 792];
	await expect(stripAcroForm(saved, await viewsOf(saved, [box, box]))).rejects.toMatchObject({
		refusal: { code: 'damaged' }
	});
});
