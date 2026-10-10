/**
 * Every PDF the builder reads goes through qpdf first. Real government forms
 * arrive locked (a permissions wrapper with an empty user password), rotated,
 * or with a cross-reference table pdf-lib will not parse, and pdf-lib carries
 * no decryption code at all: it would either throw or, with `ignoreEncryption`,
 * write plaintext into a file that still declares itself encrypted.
 *
 * They also arrive with `/Contents` as an array. The spec says to concatenate
 * those and treat them as one stream; the renderer this feeds does not, and
 * paints a blank page instead. DD 1610 and DD 577 carry eight each, and
 * `--coalesce-contents` folds them into the one stream DD 689 and DD 2977 carry.
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
 * The same PDF with its encryption removed and its page rotation folded into
 * the page. qpdf exits non-zero on warnings it recovered from, so the output
 * file existing is the test, not the exit code. A file qpdf writes nothing for
 * is refused: every later step reads these bytes as decrypted and coalesced.
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
		mod.callMain([IN, '--decrypt', '--flatten-rotation', '--coalesce-contents', OUT]);
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
	// qpdf gives its reason on stderr alone. A file the reader cannot open is
	// refused there, under its own code; one it opens is a file only qpdf rejects.
	await (await openPdf(bytes)).close();
	throw new Refused({ code: 'damaged' });
}
