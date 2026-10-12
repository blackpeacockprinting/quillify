/**
 * What a file comes to once its streams are decoded is bounded, as the file
 * is. Each file here is built from bytes and is under the cap on the file as
 * stored. A stream that two readers can read two ways is not counted: the
 * file is refused as damaged. An image comes to the bytes its dictionary
 * declares, or to what the header of its JPEG or JPEG 2000 data says when
 * that is more, and one whose dictionary does not say is refused as damaged.
 */

import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, type PDFRef } from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { templateForm } from '../test/dynamic-form.js';
import { sanitize } from './sanitize.js';
import { MAX_BYTES } from './types.js';

const MiB = 1024 * 1024;
/** The bound, as the README states it. */
const BOUND = 64 * MiB;
const text = new TextEncoder();

afterEach(() => {
	vi.unstubAllGlobals();
});

function joined(...parts: (string | Uint8Array)[]): Uint8Array<ArrayBuffer> {
	const bytes = parts.map((part) => (typeof part === 'string' ? text.encode(part) : part));
	const out = new Uint8Array(bytes.reduce((size, part) => size + part.length, 0));
	let at = 0;
	for (const part of bytes) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** `head`, then as many spaces, then `tail`, as a Flate stream. */
async function deflated(head: string | Uint8Array, spaces = 0, tail = ''): Promise<Uint8Array> {
	const block = new Uint8Array(MiB).fill(0x20);
	let left = spaces;
	const source = new ReadableStream<BufferSource>({
		start: (controller) => controller.enqueue(joined(head)),
		pull(controller) {
			if (left > 0) controller.enqueue(block.subarray(0, Math.min(left, block.length)));
			else {
				controller.enqueue(text.encode(tail));
				controller.close();
			}
			left -= block.length;
		}
	});
	const packed = source.pipeThrough(new CompressionStream('deflate'));
	return new Uint8Array(await new Response(packed).arrayBuffer());
}

/** As many spaces under RunLength: 128 of them to each two bytes, and the end of data. */
const runs = (spaces: number) => {
	const out = new Uint8Array((spaces / 128) * 2 + 1).fill(0x20);
	for (let at = 0; at < out.length - 1; at += 2) out[at] = 129;
	out[out.length - 1] = 128;
	return out;
};

const hex = (bytes: Uint8Array) =>
	`${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}>`;

type Filter = string | string[];
type Build = (doc: PDFDocument, stream: Stream) => void;

/** One page with one text field, and what `build` adds to it. */
async function form(build: Build): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const sheet = doc.addPage([612, 792]);
	doc.getForm().createTextField('x').addToPage(sheet, { x: 72, y: 700, width: 200, height: 20 });
	build(doc, (dict, bytes) =>
		doc.context.register(PDFRawStream.of(doc.context.obj({ ...dict, Length: bytes.length }), bytes))
	);
	return doc.save();
}

/** A form whose page's content is the streams given, each under its filter. */
const page = (...content: [filter: Filter, bytes: Uint8Array][]) =>
	form((doc, stream) =>
		doc
			.getPage(0)
			.node.set(
				PDFName.of('Contents'),
				doc.context.obj(content.map(([Filter, bytes]) => stream({ Filter }, bytes)))
			)
	);

type Stream = (dict: object, bytes: Uint8Array) => PDFRef;
type Declared = object | ((doc: PDFDocument, stream: Stream) => object);

/**
 * A form whose page names one image with the filters and the bytes given: a
 * gray pixel of eight bits, but for what `declared` says of it. A key it gives
 * as undefined is left out.
 */
const image = (Filter: Filter | undefined, bytes: Uint8Array, declared: Declared = {}) =>
	form((doc, stream) => {
		const dict = {
			Type: 'XObject',
			Subtype: 'Image',
			Width: 1,
			Height: 1,
			ColorSpace: 'DeviceGray',
			BitsPerComponent: 8,
			Filter,
			...(typeof declared === 'function' ? declared(doc, stream) : declared)
		};
		const said = Object.entries(dict).filter(([, value]) => value !== undefined);
		doc
			.getPage(0)
			.node.set(
				PDFName.of('Resources'),
				doc.context.obj({ XObject: { Im: stream(Object.fromEntries(said), bytes) } })
			);
	});

/**
 * A form whose page names a graphics state with a halftone of 4 by 4: a
 * threshold array in a stream, which says a width and a height as an image does.
 */
const halftone = (HalftoneType: number, bytes: Uint8Array) =>
	form((doc, stream) => {
		const HT = stream({ Type: 'Halftone', HalftoneType, Width: 4, Height: 4 }, bytes);
		doc
			.getPage(0)
			.node.set(
				PDFName.of('Resources'),
				doc.context.obj({ ExtGState: { G: { Type: 'ExtGState', HT } } })
			);
	});

/** A form whose catalog names one more stream, with the dictionary given. */
const stray = (dict: object, bytes: Uint8Array) =>
	form((doc, stream) => doc.catalog.set(PDFName.of('Stray'), stream(dict, bytes)));

/** `pdf` with the name `from` spelled `to`, which is as long. */
function respelled(pdf: Uint8Array, from: string, to: string): Uint8Array {
	const at = new TextDecoder('latin1').decode(pdf).indexOf(from);
	expect(at).toBeGreaterThan(0);
	expect(to).toHaveLength(from.length);
	pdf.set(text.encode(to), at);
	return pdf;
}

/** A file whose one page is `object`, held in an object stream that an xref stream names. */
async function inObjectStream(object: string, spaces: number, tail = ''): Promise<Uint8Array> {
	const index = '3 0 ';
	const packed = await deflated(index + object, spaces, tail);
	const objects = [
		joined('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
		joined('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
		joined(
			`4 0 obj\n<< /Type /ObjStm /N 1 /First ${index.length} /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`,
			packed,
			'\nendstream\nendobj\n'
		)
	];
	const head = '%PDF-1.7\n';
	const at = [head.length];
	for (const body of objects) at.push(at[at.length - 1] + body.length);
	// Object 0 is free, 1 and 2 are in the file, 3 is the first object of stream 4, 4 and 5 are in the file.
	const rows = [
		[0, 0, 65535],
		[1, at[0], 0],
		[1, at[1], 0],
		[2, 4, 0],
		[1, at[2], 0],
		[1, at[3], 0]
	];
	const table = new Uint8Array(rows.length * 7);
	rows.forEach(([type, where, generation], row) => {
		const view = new DataView(table.buffer, row * 7, 7);
		view.setUint8(0, type);
		view.setUint32(1, where);
		view.setUint16(5, generation);
	});
	return joined(
		head,
		...objects,
		`5 0 obj\n<< /Type /XRef /Size 6 /W [1 4 2] /Root 1 0 R /Length ${table.length} >>\nstream\n`,
		table,
		`\nendstream\nendobj\nstartxref\n${at[3]}\n%%EOF\n`
	);
}

const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >>';

/**
 * A file whose one page names `levels` images. The innermost holds `size`
 * bytes, and each of the others holds the whole object of the next one in.
 */
function nested(levels: number, size: number): Uint8Array {
	let data: Uint8Array = new Uint8Array(size);
	const opens: number[] = [];
	for (let number = levels + 3; number > 3; number--) {
		const open = `${number} 0 obj\n<< /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`;
		opens.unshift(open.length);
		data = joined(open, data, '\nendstream\nendobj\n');
	}
	const names = opens.map((_, level) => `/Im${level} ${level + 4} 0 R`).join(' ');
	const objects = [
		'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
		'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
		`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << ${names} >> >> >>\nendobj\n`
	];
	const head = '%PDF-1.7\n';
	// Where each object starts: the three, then each image, a dictionary further in than the last.
	const at = [head.length];
	for (const length of [...objects.map((object) => object.length), ...opens.slice(0, -1)])
		at.push(at[at.length - 1] + length);
	const rows = at.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
	return joined(
		head,
		...objects,
		data,
		`xref\n0 ${at.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${at.length + 1} /Root 1 0 R >>\nstartxref\n${at[3] + data.length}\n%%EOF\n`
	);
}

/** `pdf` is refused for what it comes to. What was counted is returned. */
async function tooLarge(pdf: Uint8Array): Promise<number> {
	expect(pdf.length).toBeLessThan(MAX_BYTES);
	const sanitized = await sanitize(pdf);
	expect(sanitized).toMatchObject({ ok: false, refusal: { code: 'too_large', limit: BOUND } });
	const { bytes } = (sanitized as { refusal: { bytes: number } }).refusal;
	expect(bytes).toBeGreaterThan(BOUND);
	return bytes;
}

const damaged = async (pdf: Uint8Array) =>
	expect(await sanitize(pdf)).toEqual({ ok: false, refusal: { code: 'damaged' } });

const reads = async (pdf: Uint8Array) =>
	expect(await sanitize(pdf)).toMatchObject({ ok: true, form: { fields: [{ id: 'x' }] } });

it('reads a page whose content inflates to half the bound', async () => {
	await reads(await page(['FlateDecode', await deflated('', BOUND / 2)]));
}, 120_000);

it('refuses a page whose content inflates to 1 GiB, and stops counting near the bound', async () => {
	const pdf = await page(['FlateDecode', await deflated('', 1024 * MiB)]);
	expect(await tooLarge(pdf)).toBeLessThan(2 * BOUND);
}, 120_000);

it.each<[string, (packed: Uint8Array) => Promise<[Filter, Uint8Array]>]>([
	['Flate, named /Fl', (packed) => Promise.resolve(['Fl', packed])],
	['Flate twice', async (packed) => [['FlateDecode', 'FlateDecode'], await deflated(packed)]],
	[
		'ASCIIHex and then Flate',
		(packed) => Promise.resolve([['ASCIIHexDecode', 'FlateDecode'], text.encode(hex(packed))])
	]
])(
	'refuses a page whose content inflates past the bound under %s',
	async (_, under) => {
		const pdf = await page(await under(await deflated('', 1.5 * BOUND)));
		expect(await tooLarge(pdf)).toBeLessThan(2 * BOUND);
	},
	120_000
);

/**
 * Three ways to end a Flate stream that zlib's own check rejects and a
 * lenient reader paints to the end all the same.
 */
const ENDS: [string, (stream: Uint8Array) => Uint8Array][] = [
	['a wrong check', (stream) => stream.with(stream.length - 1, stream[stream.length - 1] ^ 0xff)],
	['a byte after its end', (stream) => joined(stream, 'x')],
	['its check cut off', (stream) => stream.slice(0, -4)]
];

it.each(ENDS)(
	'refuses a page of six streams that inflate to 14 MiB each, each with %s',
	async (_, end) => {
		const stream = end(await deflated('', 14 * MiB, '\n0 0 300 300 re f\n'));
		const content = Array<[Filter, Uint8Array]>(6).fill(['FlateDecode', stream]);
		expect(await tooLarge(await page(...content))).toBeLessThan(2 * BOUND);
	},
	120_000
);

it.each(ENDS)(
	'reads a page whose one content stream has %s',
	async (_, end) => {
		await reads(await page(['FlateDecode', end(await deflated('0 0 300 300 re f\n', 16))]));
	},
	60_000
);

it('reads a page with an empty Flate stream among its content', async () => {
	await reads(
		await page(
			['FlateDecode', new Uint8Array()],
			['FlateDecode', await deflated('0 0 300 300 re f\n')]
		)
	);
}, 60_000);

it('refuses a dynamic form whose template inflates past the bound', async () => {
	expect(await tooLarge(await templateForm(' '.repeat(BOUND)))).toBeLessThan(2 * BOUND);
}, 120_000);

it('refuses an object stream that inflates to twice the bound, whatever qpdf then writes', async () => {
	// The padding is white space, so what qpdf writes for the file is a few hundred bytes.
	expect(await tooLarge(await inObjectStream(`${PAGE} >>`, 2 * BOUND))).toBeGreaterThan(2 * BOUND);
}, 120_000);

it('refuses an object stream that holds one object larger than the bound', async () => {
	await tooLarge(await inObjectStream(`${PAGE} /Pad (`, BOUND, ') >>'));
}, 120_000);

/**
 * qpdf writes nothing for a file whose `startxref` points past its end. The
 * bound does not hold the original, so no other reader is started on it:
 * pdf.js inflates such an object stream whole when it holds the catalog.
 */
it.each([
	['the page', `${PAGE} >>`, '/Root 1 0 R'],
	['the catalog', '<< /Type /Catalog /Pages 2 0 R >>', '/Root 3 0 R']
])(
	'refuses as damaged a file qpdf gives up on, %s in an object stream of twice the bound, and starts no other worker',
	async (_, object, root) => {
		const pdf = respelled(await inObjectStream(object, 2 * BOUND), '/Root 1 0 R', root);
		const started: string[] = [];
		vi.stubGlobal(
			'Worker',
			class extends Worker {
				constructor(url: string | URL, options?: WorkerOptions) {
					super(url, options);
					started.push(String(url).replace(/^.*\/|\?.*$/g, ''));
				}
			}
		);

		await damaged(respelled(pdf, 'startxref\n1', 'startxref\n9'));
		expect(started).toEqual(['qpdf.worker.js']);
	},
	120_000
);

it('refuses a page of images that lie one inside the other, and ends qpdf near the bound', async () => {
	// qpdf writes each of the 40 whole: 160 MiB, for a file of 4 MiB.
	expect(await tooLarge(nested(40, 4 * MiB))).toBeLessThan(BOUND + 5 * MiB);
}, 120_000);

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);

it.each(['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode'])(
	'reads an image under %s, alone and after Flate',
	async (codec) => {
		await reads(await image(codec, JPEG));
		await reads(await image(['FlateDecode', codec], await deflated(JPEG)));
	},
	60_000
);

it('refuses as damaged an image whose Flate layer is no Flate stream', async () => {
	await damaged(await image(['FlateDecode', 'DCTDecode'], text.encode('not deflate')));
}, 60_000);

it('refuses an image whose Flate layer inflates past the bound before its codec', async () => {
	const pdf = await image(['FlateDecode', 'DCTDecode'], await deflated(JPEG, 1.5 * BOUND));
	expect(await tooLarge(pdf)).toBeLessThan(2 * BOUND);
}, 120_000);

it.each<[string, Filter | undefined, boolean]>([
	['DCT', 'DCTDecode', false],
	['JPX', 'JPXDecode', false],
	['CCITT', 'CCITTFaxDecode', false],
	['JBIG2', 'JBIG2Decode', false],
	['Flate and then DCT', ['FlateDecode', 'DCTDecode'], true],
	['Flate', 'FlateDecode', true],
	['no filter', undefined, false]
])(
	'refuses an image of 30,000 by 30,000 under %s, for the 900 MB it declares',
	async (_, filter, packed) => {
		const bytes = packed ? await deflated(JPEG) : JPEG;
		const pdf = await image(filter, bytes, { Width: 30_000, Height: 30_000 });
		expect(await tooLarge(pdf)).toBeGreaterThan(900_000_000);
	},
	60_000
);

/** 4,096 by 4,096 pixels: 16 MiB at a byte to the pixel, a quarter of the bound. */
const SIDE = { Width: 4096, Height: 4096 };
const GRAY = { ColorSpace: 'DeviceGray', BitsPerComponent: 8 };

it.each<[string, Declared]>([
	['a byte in Indexed', { ColorSpace: ['Indexed', 'DeviceRGB', 0, PDFHexString.of('000000')] }],
	['a byte in Separation', { ColorSpace: ['Separation', 'Spot', 'DeviceCMYK', {}] }],
	// Sixteen times the pixels at a bit each: 32 MiB.
	['a bit as a mask', { Width: 16_384, Height: 16_384, ImageMask: true, ColorSpace: undefined }]
])(
	'reads an image under a codec whose pixels come to under the bound, at %s',
	async (_, declared) => {
		await reads(await image('DCTDecode', JPEG, { ...SIDE, ...declared }));
	},
	60_000
);

/**
 * Each is 4,096 wide, at a height that comes to 60 MiB and at one that comes
 * to 66 MiB. A count of a byte fewer to the pixel reads the second, and one of
 * a byte more refuses the first. JPEG 2000 says its own color space and bits,
 * so an image under it may leave either out, and counts at four components
 * for the one and eight bits for the other: what a painter makes of a pixel.
 */
it.each<[string, Filter, Declared, number, number]>([
	['three bytes in DeviceRGB', 'DCTDecode', { ColorSpace: 'DeviceRGB' }, 5120, 5632],
	['three bytes in Lab', 'DCTDecode', { ColorSpace: ['Lab', {}] }, 5120, 5632],
	['two bytes at sixteen bits', 'DCTDecode', { BitsPerComponent: 16 }, 7680, 8448],
	['four bytes under JPX with no color space', 'JPXDecode', { ColorSpace: undefined }, 3840, 4224],
	[
		'one byte under JPX with no bits to a component',
		'JPXDecode',
		{ BitsPerComponent: undefined },
		15360,
		16896
	],
	[
		'four bytes under JPX with neither',
		'JPXDecode',
		{ ColorSpace: undefined, BitsPerComponent: undefined },
		3840,
		4224
	]
])(
	'counts an image at %s',
	async (_, filter, declared, under, over) => {
		await reads(await image(filter, JPEG, { Width: 4096, Height: under, ...declared }));
		const pdf = await image(filter, JPEG, { Width: 4096, Height: over, ...declared });
		expect(await tooLarge(pdf)).toBeLessThan(BOUND + 3 * MiB);
	},
	60_000
);

const FAX = { K: -1, Columns: 1_000_000, Rows: 1_000_000 };

it.each<[string, Filter, boolean, Declared]>([
	['a dictionary', 'CCITTFaxDecode', false, { DecodeParms: FAX }],
	['an array', ['CCITTFaxDecode'], false, { DecodeParms: [FAX] }],
	['an array, after Flate', ['FlateDecode', 'CCITTFaxDecode'], true, { DecodeParms: [null, FAX] }]
])(
	'refuses a CCITT image of 1 by 1 whose /DecodeParms say a million columns and rows, in %s',
	async (_, filter, packed, declared) => {
		const pdf = await image(filter, packed ? await deflated(JPEG) : JPEG, declared);
		expect(await tooLarge(pdf)).toBeGreaterThan(1e11);
	},
	60_000
);

it('counts a CCITT image for its own width and height when they are the larger', async () => {
	const bit = { BitsPerComponent: 1, Width: 16_384 };
	// 32 MiB, with the columns and rows a real one says: its own.
	await reads(
		await image('CCITTFaxDecode', JPEG, {
			...bit,
			Height: 16_384,
			DecodeParms: { K: -1, Columns: 16_384, Rows: 16_384 }
		})
	);
	const pdf = await image('CCITTFaxDecode', JPEG, {
		...bit,
		Height: 34_816,
		DecodeParms: { K: -1, Columns: 1, Rows: 0 }
	});
	expect(await tooLarge(pdf)).toBeLessThan(BOUND + 5 * MiB);
}, 60_000);

/**
 * A JPEG that is its frame header and no more: a start-of-frame segment
 * under `marker`, with `before` between the start of the image and it.
 */
const frame = (
	width: number,
	height: number,
	{ components = 1, bits = 8, marker = 0xc0, before = [] as number[] } = {}
) =>
	Uint8Array.of(
		...[0xff, 0xd8, ...before, 0xff, marker, 0, 8 + 3 * components, bits],
		...[height >> 8, height & 255, width >> 8, width & 255, components],
		...Array<number>(3 * components).fill(0x11),
		...[0xff, 0xd9]
	);

/**
 * A JPEG 2000 codestream that is its SIZ segment and no more: an image of
 * the size given, with a component of each of `bits`, `inset` each way from
 * the origin of its grid.
 */
function codestream(width: number, height: number, bits = [8], inset = 0): Uint8Array {
	const out = new Uint8Array(42 + 3 * bits.length);
	const view = new DataView(out.buffer);
	[0xff4f, 0xff51, 38 + 3 * bits.length, 0].forEach((value, at) => view.setUint16(2 * at, value));
	[inset + width, inset + height, inset, inset, inset + width, inset + height, 0, 0].forEach(
		(value, at) => view.setUint32(8 + 4 * at, value)
	);
	view.setUint16(40, bits.length);
	bits.forEach((depth, at) => out.set([depth - 1, 1, 1], 42 + 3 * at));
	return out;
}

/** A box of a JP2 file: its length, its type and what it holds. */
function box(type: string, ...parts: (string | Uint8Array)[]): Uint8Array {
	const body = joined(...parts);
	const size = new Uint8Array(4);
	new DataView(size.buffer).setUint32(0, 8 + body.length);
	return joined(size, type, body);
}

/** A box whose length is written wide, in eight bytes after its type. */
const wide = (type: string, body: Uint8Array) =>
	joined(
		Uint8Array.of(0, 0, 0, 1),
		type,
		Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 16 + body.length),
		body
	);

/** A JP2 file whose image header says a gray pixel, with `stream` for its codestream after `between`. */
const jp2 = (stream: Uint8Array, between = new Uint8Array()) =>
	joined(
		box('jP  ', Uint8Array.of(0x0d, 0x0a, 0x87, 0x0a)),
		box('ftyp', 'jp2 ', new Uint8Array(4), 'jp2 '),
		box('jp2h', box('ihdr', Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 7, 7, 0, 0))),
		between,
		box('jp2c', stream)
	);

/**
 * What a marker reader passes on its way to a frame: an application segment
 * of 16 bytes, a Huffman table of 10 under a marker numbered among the
 * frames', a restart marker, which has no length, a byte that is no marker,
 * a zero after FF, which is no marker either, and a fill byte.
 */
const AHEAD = [
	...[0xff, 0xe0, 0, 16, ...Array<number>(14).fill(0)],
	...[0xff, 0xc4, 0, 10, ...Array<number>(8).fill(0)],
	...[0xff, 0xd0, 0x55, 0xff, 0x00, 0xff]
];
type Headed = (size: number) => Uint8Array | Promise<Uint8Array>;

/**
 * Each image's dictionary says a gray pixel of eight bits, and its codec's own
 * header says 4,096 wide (but for the last two) at a height that comes to
 * 60 MiB and at one that comes to 66 MiB. A decoder goes by the header.
 */
it.each<[string, Filter, Headed, number, number]>([
	['a JPEG of a byte', 'DCTDecode', (height) => frame(4096, height), 15360, 16896],
	['a JPEG of three bytes', 'DCTDecode', (h) => frame(4096, h, { components: 3 }), 5120, 5632],
	['a JPEG of twelve bits', 'DCTDecode', (h) => frame(4096, h, { bits: 12 }), 10240, 11264],
	['a progressive JPEG', 'DCTDecode', (h) => frame(4096, h, { marker: 0xc2 }), 15360, 16896],
	[
		'a JPEG whose frame comes after a segment, a table, a restart, a stray byte and a fill byte',
		'DCTDecode',
		(height) => frame(4096, height, { before: AHEAD }),
		15360,
		16896
	],
	[
		'a JPEG that starts after bytes whose segment would pass over it',
		'DCTDecode',
		(height) => Uint8Array.of(0, 0, 0xff, 0xe0, 0, 19, ...frame(4096, height)),
		15360,
		16896
	],
	[
		'a JPEG under Flate',
		['FlateDecode', 'DCTDecode'],
		(height) => deflated(frame(4096, height)),
		15360,
		16896
	],
	['a JPEG 2000 codestream', 'JPXDecode', (height) => codestream(4096, height), 15360, 16896],
	[
		'a JPEG 2000 codestream of three components',
		'JPXDecode',
		(height) => codestream(4096, height, [8, 8, 8]),
		5120,
		5632
	],
	[
		'a JPEG 2000 codestream of a bit in its first component and sixteen in the others',
		'JPXDecode',
		(height) => codestream(4096, height, [1, 16, 16]),
		2560,
		2816
	],
	[
		'a JPEG 2000 codestream in from the origin of its grid',
		'JPXDecode',
		(height) => codestream(4096, height, [8], 1_000_000),
		15360,
		16896
	],
	['a JP2 file', 'JPXDecode', (height) => jp2(codestream(4096, height)), 15360, 16896],
	[
		'a JP2 file with a box of a wide length',
		'JPXDecode',
		(height) => jp2(codestream(4096, height), wide('free', new Uint8Array(8))),
		15360,
		16896
	],
	// The codestream is in the first `jp2c` box, and the one after it is empty.
	[
		'a JP2 file whose codestream is in a box of a wide length',
		'JPXDecode',
		(height) => jp2(new Uint8Array(), wide('jp2c', codestream(4096, height))),
		15360,
		16896
	],
	[
		'a JP2 file under Flate',
		['FlateDecode', 'JPXDecode'],
		(height) => deflated(jp2(codestream(4096, height))),
		15360,
		16896
	],
	[
		'a JPEG 2000 codestream wider than a JPEG can say',
		'JPXDecode',
		(height) => codestream(30_000 * 64, height),
		32,
		36
	],
	// A frame of no height takes it from a DNL marker after the scan, which can say 65,535.
	[
		'a JPEG whose frame leaves its height to a later marker',
		'DCTDecode',
		(width) => frame(width, 0),
		960,
		1056
	]
])(
	'counts an image of 1 by 1 for what its own header says, in %s',
	async (_, filter, headed, under, over) => {
		await reads(await image(filter, await headed(under)));
		expect(await tooLarge(await image(filter, await headed(over)))).toBeLessThan(BOUND + 3 * MiB);
	},
	60_000
);

it.each<[string, Filter, Uint8Array]>([
	['a JPEG', 'DCTDecode', frame(64, 64)],
	['a JPEG 2000 codestream', 'JPXDecode', codestream(64, 64)],
	['a JP2 file', 'JPXDecode', jp2(codestream(64, 64))]
])(
	'reads an image whose dictionary says what the header of %s says',
	async (_, filter, bytes) => {
		await reads(await image(filter, bytes, { Width: 64, Height: 64 }));
	},
	60_000
);

const VAST = jp2(codestream(30_000, 30_000));

it.each<[string, Filter, Uint8Array]>([
	['a JPEG cut short in its frame header', 'DCTDecode', frame(30_000, 30_000).slice(0, 8)],
	[
		'a JPEG whose segment before the frame runs past its end',
		'DCTDecode',
		frame(30_000, 30_000, { before: [0xff, 0xe0, 0xff, 0xff] })
	],
	// The frame a thumbnail carries is in a segment's data, and is passed over with it.
	[
		'a JPEG with a frame header inside an application segment',
		'DCTDecode',
		frame(1, 1, { before: [0xff, 0xe1, 0, 15, ...frame(30_000, 30_000).slice(2)] })
	],
	['a JPEG with no frame header', 'DCTDecode', JPEG],
	[
		'a JPEG 2000 codestream cut short in its SIZ segment',
		'JPXDecode',
		codestream(30_000, 30_000).slice(0, 14)
	],
	['a JP2 file cut short before its codestream', 'JPXDecode', VAST.slice(0, 60)],
	['a JP2 file cut short in its SIZ segment', 'JPXDecode', VAST.slice(0, -31)],
	[
		'a JP2 file with a box of no length before its codestream',
		'JPXDecode',
		jp2(codestream(30_000, 30_000), new Uint8Array(8))
	]
])(
	'reads an image of 1 by 1 as its dictionary says, in %s',
	async (_, filter, bytes) => {
		await reads(await image(filter, bytes));
	},
	60_000
);

/** A number written as given: more digits than pdf-lib writes for any number. */
function written(digits: string): PDFNumber {
	const number = PDFNumber.of(1);
	Object.assign(number, { stringValue: digits });
	return number;
}

const E308 = `1${'0'.repeat(308)}`;

/**
 * qpdf writes nothing for a file with an integer past 64 bits, and keeps a
 * real number as it is written. pdf-lib reads 400 digits as infinity, and
 * 1e308 at eight bits to the pixel passes the largest number there is.
 */
it.each([
	['400 digits', '9'.repeat(400)],
	['400 digits and a fraction', `${'9'.repeat(400)}.0`],
	['1e308, as 309 digits', E308],
	['1e308, as 309 digits and a fraction', `${E308}.0`]
])(
	'refuses as damaged an image whose width is %s',
	async (_, digits) => {
		await damaged(await image('DCTDecode', JPEG, { Width: written(digits) }));
	},
	60_000
);

it('refuses an image whose width is 1e300 for a count that is a number', async () => {
	const pdf = await image('DCTDecode', JPEG, { Width: written(`1${'0'.repeat(300)}.0`) });
	expect(await tooLarge(pdf)).toBeLessThan(Infinity);
}, 60_000);

it.each<[string, Declared]>([
	['DeviceCMYK', { ColorSpace: 'DeviceCMYK' }],
	[
		'an ICC profile of four components',
		(_, stream) => ({ ...SIDE, ColorSpace: ['ICCBased', stream({ N: 4 }, new Uint8Array())] })
	],
	['DeviceN of four colorants', { ColorSpace: ['DeviceN', ['C', 'M', 'Y', 'K'], 'DeviceCMYK', {}] }]
])(
	'refuses an image under a codec whose pixels come to the bound, at four bytes in %s',
	async (_, declared) => {
		const pdf = await image(
			'DCTDecode',
			JPEG,
			typeof declared === 'function' ? declared : { ...SIDE, ...declared }
		);
		expect(await tooLarge(pdf)).toBeLessThan(BOUND + MiB);
	},
	60_000
);

it('counts an image under Flate for what it declares or what its stream gives, whichever is more', async () => {
	// 16 MiB declared and 16 MiB in the stream are 16 MiB, and the image's mask is as much: 32 MiB.
	const honest = await deflated('', 16 * MiB);
	await reads(
		await image('FlateDecode', honest, (_, stream) => ({
			...SIDE,
			SMask: stream({ Subtype: 'Image', ...SIDE, ...GRAY, Filter: 'FlateDecode' }, honest)
		}))
	);
	// A pixel declared and 1.5 times the bound in the stream.
	await tooLarge(await image('FlateDecode', await deflated('', 1.5 * BOUND)));
}, 120_000);

it('counts a soft mask that says no /Subtype', async () => {
	const pdf = await image('DCTDecode', JPEG, (_, stream) => ({
		SMask: stream({ Width: 30_000, Height: 30_000, ...GRAY, Filter: 'DCTDecode' }, JPEG)
	}));
	await tooLarge(pdf);
}, 60_000);

it.each<[string, Declared]>([
	['no width', { Width: undefined }],
	['no height', { Height: undefined }],
	['a name for its width', { Width: 'Wide' }],
	['a width under zero', { Width: -30_000 }],
	['no bits to a component', { BitsPerComponent: undefined }],
	['bits to a component under zero', { BitsPerComponent: -8 }],
	['zero bits to a component', { BitsPerComponent: 0 }],
	['a hundredth of a bit to a component', { BitsPerComponent: 0.01 }],
	['no color space', { ColorSpace: undefined }],
	['a color space nobody knows', { ColorSpace: 'Zip' }],
	['a color space named as an object names a key of its own', { ColorSpace: 'constructor' }],
	['a pattern for its color space', { ColorSpace: ['Pattern', 'DeviceRGB'] }],
	['an ICC profile that says no /N', { ColorSpace: ['ICCBased', {}] }],
	[
		'an ICC profile of no components',
		(_, stream) => ({ ColorSpace: ['ICCBased', stream({ N: 0 }, new Uint8Array())] })
	],
	['DeviceN of no colorants', { ColorSpace: ['DeviceN', [], 'DeviceCMYK', {}] }]
])(
	'refuses as damaged an image with %s',
	async (_, declared) => {
		const pdf = await image('DCTDecode', JPEG, (doc, stream) => ({
			Width: 30_000,
			Height: 30_000,
			...(typeof declared === 'function' ? declared(doc, stream) : declared)
		}));
		await damaged(pdf);
	},
	60_000
);

it.each<[string, Filter | undefined, boolean]>([
	['Flate', 'FlateDecode', true],
	['no filter', undefined, false]
])(
	'refuses as damaged an image of zero bits to a component under %s',
	async (_, filter, packed) => {
		const bytes = packed ? await deflated(JPEG) : JPEG;
		await damaged(await image(filter, bytes, { ...SIDE, BitsPerComponent: 0 }));
	},
	60_000
);

it.each([
	[6, 16],
	[16, 32]
])(
	'reads a page whose graphics state has a halftone of Type %i',
	async (type, size) => {
		await reads(await halftone(type, new Uint8Array(size)));
	},
	60_000
);

it('counts an image that says it is a halftone and no more, at two bytes to the pixel', async () => {
	const pdf = await image('DCTDecode', JPEG, {
		HalftoneType: 6,
		Width: 30_000,
		Height: 30_000,
		ColorSpace: undefined,
		BitsPerComponent: undefined
	});
	expect(await tooLarge(pdf)).toBeGreaterThan(1_800_000_000);
}, 60_000);

it.each<[string, (stream: Uint8Array) => Uint8Array]>([
	// CINFO 8 names a window of 64 KiB, and the two bytes still pass the header's own check.
	[
		'names a window wider than Flate has',
		(stream) => joined(Uint8Array.of(0x88, 0x1c), stream.subarray(2))
	],
	// A stored block of no bytes, whose second length is not the complement of the first.
	[
		'opens with a stored block of two lengths that disagree',
		(stream) => joined(stream.subarray(0, 2), new Uint8Array(5), stream.subarray(2))
	]
])(
	'refuses as damaged a page whose content %s',
	async (_, broken) => {
		await damaged(await page(['FlateDecode', broken(await deflated('0 0 300 300 re f\n', MiB))]));
	},
	60_000
);

it.each<[string, Filter, (bytes: Uint8Array) => Promise<Uint8Array>]>([
	['RunLength', 'RunLengthDecode', (bytes) => Promise.resolve(bytes)],
	['Flate and then RunLength', ['FlateDecode', 'RunLengthDecode'], (bytes) => deflated(bytes)]
])(
	'refuses as damaged a page whose content is under %s',
	async (_, filter, packed) => {
		await damaged(await page([filter, await packed(runs(1024))]));
	},
	60_000
);

it.each<[string, Filter, Uint8Array]>([
	['a filter nobody knows', 'Zip', text.encode('0 0 300 300 re f\n')],
	['ASCII85 and then a codec', ['ASCII85Decode', 'DCTDecode'], text.encode('zzzz~>')],
	['RunLength and then a codec', ['RunLengthDecode', 'DCTDecode'], Uint8Array.of(3, ...JPEG, 128)],
	['two codecs', ['DCTDecode', 'CCITTFaxDecode'], JPEG]
])(
	'refuses as damaged an image under %s',
	async (_, filter, bytes) => {
		await damaged(await image(filter, bytes));
	},
	60_000
);

it('refuses as damaged an image under Flate twice and then a codec', async () => {
	await damaged(
		await image(['FlateDecode', 'FlateDecode', 'DCTDecode'], await deflated(await deflated(JPEG)))
	);
}, 60_000);

/**
 * pdf-lib inflates a stream typed as an object stream or as an xref stream
 * whole, as it parses the file, and qpdf keeps such a stream when the file
 * names it as an ordinary object. qpdf reads the escape of the third spelling
 * and writes the letter. In the fourth it writes the `#` it could not read as
 * it is, and after it the 4 it could, so pdf-lib reads `#4F`, an O.
 */
it.each(['/ObjStm', '/XRef', '/Obj#53tm', '/##34FbjStm'])(
	'refuses as damaged a file with a stray stream typed %s',
	async (typed) => {
		const pending = 'P'.repeat(typed.length - 1);
		const pdf = await stray(
			{ Type: pending, N: 0, First: 0, Filter: 'FlateDecode' },
			await deflated('', MiB)
		);
		await damaged(respelled(pdf, `/Type /${pending}`, `/Type ${typed}`));
	},
	60_000
);

it('reads a file with a stray stream of a type pdf-lib does not inflate', async () => {
	await reads(await stray({ Type: 'Metadata', Filter: 'FlateDecode' }, await deflated('', MiB)));
}, 60_000);

it('refuses as damaged a file with a stray stream typed through a reference', async () => {
	const pdf = await form((doc, stream) => {
		const name = doc.context.register(PDFName.of('ObjStm'));
		doc.catalog.set(PDFName.of('Name'), name);
		doc.catalog.set(PDFName.of('Stray'), stream({ Type: name, N: 0, First: 0 }, new Uint8Array(8)));
	});
	await damaged(pdf);
}, 60_000);
