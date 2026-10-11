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
 *
 * qpdf runs in a worker of its own for each file: `assets/qpdf.worker.js`,
 * which is qpdf-wasm's script with `qpdf-handler.js` after it. The worker ends
 * with the call, so a trap, a grown heap and whatever qpdf's `main` leaves
 * behind end with it, and the page's thread is free while qpdf runs.
 */

import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_BYTES } from './types.js';

// Held in a constant so that Vite copies the worker byte for byte. Written
// inside `new Worker(...)`, the URL makes it bundle the file again.
const WORKER = new URL('../assets/qpdf.worker.js', import.meta.url);
// A bundler renames both files, so the worker is told where the binary is.
const WASM = new URL('../assets/qpdf.wasm', import.meta.url);
const FLAGS = ['--decrypt', '--flatten-rotation', '--object-streams=disable'];

/** What `assets/qpdf.worker.js` answers. `out` is missing when qpdf wrote no file. */
interface Answer {
	loaded: boolean;
	out?: Uint8Array;
}

/**
 * The same PDF with its encryption removed and a page's own quarter turn folded
 * into the page. qpdf exits non-zero on warnings it recovered from, so what is
 * tested is that it wrote an output file. A file qpdf writes nothing for is
 * refused: every later step reads these bytes as decrypted.
 */
export async function normalizePdf(bytes: Uint8Array): Promise<Uint8Array> {
	// Before a worker starts, because qpdf is the step that allocates.
	if (bytes.byteLength > MAX_BYTES)
		throw new Refused({ code: 'too_large', bytes: bytes.byteLength, limit: MAX_BYTES });

	const worker = new Worker(WORKER);
	// A copy, moved to the worker. A view posted as it is takes its whole buffer along.
	const copy = bytes.slice();
	const { loaded, out } = await new Promise<Answer>((resolve, reject) => {
		worker.onmessage = ({ data }) => resolve(data);
		worker.onerror = () => reject(new Error(`qpdf.worker.js did not load from ${WORKER}`));
		worker.postMessage({ bytes: copy, flags: FLAGS, wasm: WASM.href }, [copy.buffer]);
	}).finally(() => worker.terminate());
	if (!loaded) throw new Error(`qpdf.wasm did not load from ${WASM}`);
	if (out?.byteLength) return out;

	// qpdf gives its reason on stderr alone. A file pdf.js cannot open is refused
	// there, under its own code. One it opens is a file only qpdf rejects.
	await (await openPdf(bytes)).close();
	throw new Refused({ code: 'damaged' });
}
