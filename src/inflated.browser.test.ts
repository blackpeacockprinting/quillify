/**
 * What a file comes to once its streams are decoded is bounded, as the file
 * is. Each file here is built from bytes and is under the cap on the file as
 * stored. A stream that two readers can read two ways is not counted: the
 * file is refused as damaged.
 */

import { PDFDocument, PDFName, PDFRawStream, type PDFRef } from 'pdf-lib';
import { expect, it } from 'vitest';
import { templateForm } from '../test/dynamic-form.js';
import { sanitize } from './sanitize.js';
import { MAX_BYTES } from './types.js';

const MiB = 1024 * 1024;
/** The bound, as the README states it. */
const BOUND = 64 * MiB;
const text = new TextEncoder();

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
type Build = (doc: PDFDocument, stream: (dict: object, bytes: Uint8Array) => PDFRef) => void;

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

/** A form whose page names one image, a pixel wide, with the filters and the bytes given. */
const image = (Filter: Filter, bytes: Uint8Array) =>
	form((doc, stream) =>
		doc.getPage(0).node.set(
			PDFName.of('Resources'),
			doc.context.obj({
				XObject: {
					Im: stream(
						{
							Type: 'XObject',
							Subtype: 'Image',
							Width: 1,
							Height: 1,
							ColorSpace: 'DeviceGray',
							BitsPerComponent: 8,
							Filter
						},
						bytes
					)
				}
			})
		)
	);

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
