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
 * object stream. A page's content streams stay apart, as the engine paints
 * them (`background.browser.test.ts`), and a Flate stream is copied as stored.
 *
 * Unconditional, so there is one path and no guessing about which files need
 * it. On a file that needs nothing it is a rewrite.
 */

import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_BYTES } from './types.js';

const WASM = new URL('../assets/qpdf.wasm', import.meta.url);
const IN = '/in.pdf';
const OUT = '/out.pdf';

interface QpdfFs {
	writeFile(path: string, data: Uint8Array): void;
	readFile(path: string): Uint8Array;
	unlink(path: string): void;
}

interface Qpdf {
	callMain(args: string[]): number;
	FS: QpdfFs;
}

let qpdf: Promise<Qpdf> | null = null;

function load(): Promise<Qpdf> {
	qpdf ??= import('@neslinesli93/qpdf-wasm')
		.then((mod) =>
			(mod.default as unknown as (opts: { locateFile: () => string }) => Promise<Qpdf>)({
				locateFile: () => WASM.href
			})
		)
		.catch((cause: unknown) => {
			qpdf = null;
			throw new Error(`qpdf.wasm did not load from ${WASM}`, { cause });
		});
	return qpdf;
}

/**
 * The same PDF with its encryption removed and a page's own quarter turn folded
 * into the page. qpdf exits non-zero on warnings it recovered from, so what is
 * tested is that it wrote an output file. A file qpdf writes nothing for is
 * refused: every later step reads these bytes as decrypted.
 */
export async function normalizePdf(bytes: Uint8Array): Promise<Uint8Array> {
	// Before the module loads, because this is the step that allocates. The
	// emscripten heap only grows and the module is held for the life of the page,
	// so a file refused later is memory pinned for the session.
	if (bytes.byteLength > MAX_BYTES)
		throw new Refused({ code: 'too_large', bytes: bytes.byteLength, limit: MAX_BYTES });

	const mod = await load();
	const { FS } = mod;
	try {
		FS.writeFile(IN, bytes);
		mod.callMain([IN, '--decrypt', '--flatten-rotation', '--object-streams=disable', OUT]);
		const out = FS.readFile(OUT);
		if (out.byteLength > 0) return new Uint8Array(out);
	} catch {
		// qpdf wrote nothing it could stand behind.
	} finally {
		for (const path of [IN, OUT]) {
			try {
				FS.unlink(path);
			} catch {
				// The virtual filesystem is this module's alone.
			}
		}
	}
	// qpdf gives its reason on stderr alone. A file pdf.js cannot open is refused
	// there, under its own code. One it opens is a file only qpdf rejects.
	await (await openPdf(bytes)).close();
	throw new Refused({ code: 'damaged' });
}
