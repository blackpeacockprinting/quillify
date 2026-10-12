/**
 * Every PDF the library reads goes through qpdf first. Published forms arrive
 * locked (a permissions wrapper with an empty user password), and pdf-lib
 * carries no decryption code at all: it would either throw or, with
 * `ignoreEncryption`, write plaintext into a file that still declares itself
 * encrypted.
 *
 * `--flatten-rotation` folds a page's own quarter turn into its content, since
 * the engine rejects a page that carries `/Rotate`
 * (`rotation.browser.test.ts`). `--object-streams=disable` writes every object
 * in the open, so pdf.js and pdf-lib, which read what qpdf wrote, inflate no
 * object stream. `--recompress-flate` has qpdf decode every stream under
 * Flate, LZW, ASCII85 or ASCIIHex and write it back as one Flate stream of its
 * own, so the readers after it have nothing to disagree on: a stream that
 * ends in a wrong check is no longer one. A page's content streams stay
 * apart, as the engine paints them (`background.browser.test.ts`).
 *
 * Unconditional, so there is one path and no guessing about which files need
 * it. On a file that needs nothing it is a rewrite.
 *
 * qpdf runs in a worker of its own for each file: `assets/qpdf.worker.js`,
 * which is qpdf-wasm's script with `qpdf-handler.js` after it. The worker ends
 * with the call, so a trap, a grown heap and whatever qpdf's `main` leaves
 * behind end with it, and the page's thread is free while qpdf runs.
 *
 * The file is held to `MAX_INFLATED_BYTES` twice: in the worker, where qpdf
 * is ended at the write that passes it, and then in what qpdf wrote, on the
 * page's thread and before any other reader opens it.
 */

import {
	ParseSpeeds,
	PDFArray,
	PDFBool,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNumber,
	PDFRawStream,
	PDFStream
} from 'pdf-lib';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_BYTES, MAX_INFLATED_BYTES } from './types.js';

// Held in a constant so that Vite copies the worker byte for byte. Written
// inside `new Worker(...)`, the URL makes it bundle the file again.
const WORKER = new URL('../assets/qpdf.worker.js', import.meta.url);
// A bundler renames both files, so the worker is told where the binary is.
const WASM = new URL('../assets/qpdf.wasm', import.meta.url);
const FLAGS = ['--decrypt', '--flatten-rotation', '--object-streams=disable', '--recompress-flate'];

/**
 * What `assets/qpdf.worker.js` answers. `out` is the file of a run qpdf ended
 * well. `size` is what the file came to in qpdf: the bytes it wrote or the
 * size its memory grew to, whichever is more.
 */
type Answer = { loaded: false } | { loaded: true; out?: Uint8Array; size: number };

/**
 * The two types of stream pdf-lib inflates whole as it parses a file, in every
 * spelling it reads as their names: each letter as it is, or as `#` and its
 * code.
 */
const spelled = (name: string) =>
	[...name]
		.map((letter) => `(?:${letter}|#${letter.charCodeAt(0).toString(16).toUpperCase()})`)
		.join('');
const TYPED = new RegExp(`/(?:${spelled('ObjStm')}|${spelled('XRef')})`);
/**
 * A Flate stream goes to the decoder this much at a time. The decoder inflates
 * all of what it is handed before it gives any of it: 1 GiB, for a stream of
 * 1 MB handed over whole.
 */
const SLICE = 1024;
/** What qpdf leaves a stream under, alone or after one Flate layer. Each gives pixels. */
const CODECS = ['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode'];
/** The components of a pixel in a color space that is this name or an array that begins with it. */
const COMPONENTS = new Map([
	['DeviceGray', 1],
	['CalGray', 1],
	['Indexed', 1],
	['Separation', 1],
	['DeviceRGB', 3],
	['CalRGB', 3],
	['Lab', 3],
	['DeviceCMYK', 4]
]);

/**
 * The bytes an image's pixels come to as its dictionary declares them: rows
 * of whole bytes, at its bits to a component and the components of its color
 * space, or at a bit to the pixel for a mask. A halftone's threshold array
 * says a width and a height too, and neither bits nor a color space: a stream
 * with a `/HalftoneType` and neither comes to two bytes to the pixel, the most
 * such an array holds. A stream with no `/Width` and no `/Height` is no image
 * and comes to none. One with either whose dictionary does not say what it
 * comes to, in a component or more of a bit or more, is refused as `damaged`.
 *
 * JPEG 2000 data says its own color space and bits, so an image under
 * `JPXDecode` may leave either out, and counts at four components for the
 * one and eight bits for the other, what a painter makes of a pixel. A
 * CCITT decoder goes by the `/Columns` and `/Rows` of its `/DecodeParms`,
 * so each counts where it is written and more than the image's own.
 * `chain` is the stream's filters.
 */
function declared(dict: PDFDict, chain: string[]): number {
	if (!dict.has(PDFName.of('Width')) && !dict.has(PDFName.of('Height'))) return 0;
	const number = (from: PDFDict, key: string) => {
		const value = from.lookup(PDFName.of(key));
		return value instanceof PDFNumber ? value.asNumber() : NaN;
	};
	const codec = chain.at(-1);
	const jpx = codec === 'JPXDecode';
	const parms = codec === 'CCITTFaxDecode' && dict.lookup(PDFName.of('DecodeParms'));
	const fax = parms instanceof PDFArray ? parms.lookup(chain.length - 1) : parms;
	const side = (key: string, said: string) => {
		const own = number(dict, key);
		const more = fax instanceof PDFDict ? number(fax, said) : NaN;
		return more > own ? more : own;
	};
	const mask = dict.lookup(PDFName.of('ImageMask')) === PDFBool.True;
	const space = dict.lookup(PDFName.of('ColorSpace'));
	const threshold =
		dict.has(PDFName.of('HalftoneType')) && !space && !dict.has(PDFName.of('BitsPerComponent'));
	const [family, part] = space instanceof PDFArray ? [space.lookup(0), space.lookup(1)] : [space];
	const name = family instanceof PDFName ? family.decodeText() : '';
	const components =
		mask || threshold
			? 1
			: name === 'ICCBased' && part instanceof PDFStream
				? number(part.dict, 'N')
				: name === 'DeviceN' && part instanceof PDFArray
					? part.size()
					: jpx && !space
						? 4
						: (COMPONENTS.get(name) ?? NaN);
	const bits = mask
		? 1
		: threshold
			? 16
			: jpx && !dict.has(PDFName.of('BitsPerComponent'))
				? 8
				: number(dict, 'BitsPerComponent');
	const bytes =
		Math.ceil((side('Width', 'Columns') * components * bits) / 8) * side('Height', 'Rows');
	if (!(components >= 1 && bits >= 1 && bytes >= 0)) throw new Refused({ code: 'damaged' });
	return bytes;
}

/**
 * The size of the file qpdf wrote and of what its streams decode to, added up
 * no further than the bound. pdf-lib lists the streams and the browser
 * inflates each Flate one, keeping nothing. An image comes to what its
 * dictionary declares, or to what its Flate layer gives when that is more. A
 * stream the browser's decoder rejects, or one under a filter qpdf has not
 * taken off, is a stream two readers can read two ways, and the file is
 * refused as `damaged`.
 */
async function inflated(pdf: Uint8Array): Promise<number> {
	let total = pdf.byteLength;
	// qpdf has written no stream of either type, so one that is here came with the file.
	if (TYPED.test(new TextDecoder('latin1').decode(pdf))) throw new Refused({ code: 'damaged' });

	// pdf-lib waits on a timer between batches of objects unless it is told not to.
	const { context } = await PDFDocument.load(pdf, {
		updateMetadata: false,
		parseSpeed: ParseSpeeds.Fastest
	});
	for (const [, object] of context.enumerateIndirectObjects()) {
		if (!(object instanceof PDFRawStream)) continue;
		const { dict, contents } = object;
		const filter = dict.lookup(PDFName.of('Filter'));
		const chain = (
			filter instanceof PDFArray
				? filter.asArray().map((entry) => context.lookup(entry))
				: filter
					? [filter]
					: []
		).map((entry) => (entry instanceof PDFName ? entry.decodeText() : ''));
		const flate = chain[0] === 'FlateDecode';
		const rest = chain.slice(flate ? 1 : 0);
		if (rest.length > 1 || rest.some((name) => !CODECS.includes(name)))
			throw new Refused({ code: 'damaged' });
		const least = total + declared(dict, chain);
		// An empty stream is one to every reader, and to the decoder a stream cut short.
		if (!flate || !contents.length) {
			total = least;
			continue;
		}

		let at = 0;
		const reader = new ReadableStream<BufferSource>({
			pull(controller) {
				if (at < contents.length) controller.enqueue(contents.slice(at, (at += SLICE)));
				else controller.close();
			}
		})
			.pipeThrough(new DecompressionStream('deflate'))
			.getReader();
		try {
			for (let read = await reader.read(); !read.done; read = await reader.read()) {
				total += read.value.byteLength;
				if (total > MAX_INFLATED_BYTES) return total;
			}
		} catch {
			throw new Refused({ code: 'damaged' });
		} finally {
			void reader.cancel().catch(() => {});
		}
		total = Math.max(total, least);
	}
	return total;
}

/**
 * The same PDF with its encryption removed and a page's own quarter turn folded
 * into the page. The worker answers with qpdf's file only when qpdf ended
 * well, with or without warnings, since an error leaves the file cut short. A
 * file it answers nothing for is refused: every later step reads these bytes
 * as decrypted. So is a file that comes to more than `MAX_INFLATED_BYTES`, in
 * qpdf or in what qpdf wrote. The worker is ended when it answers, or when
 * `signal` fires before it has.
 */
export async function normalizePdf(bytes: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
	// Before a worker starts, because qpdf is the step that allocates.
	if (bytes.byteLength > MAX_BYTES)
		throw new Refused({ code: 'too_large', bytes: bytes.byteLength, limit: MAX_BYTES });

	const worker = new Worker(WORKER);
	// A copy, moved to the worker. A view posted as it is takes its whole buffer along.
	const copy = bytes.slice();
	const { promise, resolve, reject } = Promise.withResolvers<Answer>();
	const late = () => reject(signal?.reason);
	signal?.addEventListener('abort', late);
	worker.onmessage = ({ data }) => resolve(data);
	worker.onerror = () => reject(new Error(`qpdf.worker.js did not load from ${WORKER}`));
	worker.postMessage({ bytes: copy, flags: FLAGS, wasm: WASM.href, limit: MAX_INFLATED_BYTES }, [
		copy.buffer
	]);
	const answer = await promise.finally(() => {
		signal?.removeEventListener('abort', late);
		worker.terminate();
	});
	if (!answer.loaded) throw new Error(`qpdf.wasm did not load from ${WASM}`);
	const { out, size } = answer;
	// A file that came to more than the bound in qpdf is past it, whatever qpdf then wrote.
	const total = size > MAX_INFLATED_BYTES ? size : out?.byteLength ? await inflated(out) : 0;
	if (total > MAX_INFLATED_BYTES)
		throw new Refused({ code: 'too_large', bytes: total, limit: MAX_INFLATED_BYTES });
	if (out?.byteLength) return out;

	// qpdf gives its reason on stderr alone. A file pdf.js cannot open is refused
	// there, under its own code. One it opens is a file only qpdf rejects.
	await (await openPdf(bytes, {}, signal)).close();
	throw new Refused({ code: 'damaged' });
}
