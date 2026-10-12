/**
 * A file pdf.js will not open is refused at the open, under a code the caller
 * can branch on. pdf.js's own message ("No password given", "Invalid PDF
 * structure.") reads as a crash for a file a stage is only declining.
 * `sanitize` starts no pdf.js worker for any of these files: qpdf writes
 * nothing for it, and what qpdf says of it, or else its first bytes, give the
 * code. A PDF cut off halfway has a PDF's header, so there it is damaged.
 */

import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { PDFDocument, PDFName } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPdf } from './pdfjs.js';
import { Refused, type Refusal } from './refusal.js';
import { sanitize } from './sanitize.js';
import { xfaToAcroForm } from './xfa.js';

async function blank(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	return doc.save();
}

interface Qpdf {
	callMain(args: string[]): number;
	FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array };
}

/** A user password, which `--decrypt` cannot remove without being told it. */
async function locked(): Promise<Uint8Array> {
	const init = (await import('@neslinesli93/qpdf-wasm')).default as unknown as (opts: {
		locateFile: () => string;
	}) => Promise<Qpdf>;
	const qpdf = await init({ locateFile: () => wasmUrl });
	qpdf.FS.writeFile('/plain.pdf', await blank());
	qpdf.callMain(['/plain.pdf', '--encrypt', 'secret', 'owner', '256', '--', '/locked.pdf']);
	return new Uint8Array(qpdf.FS.readFile('/locked.pdf'));
}

/** A trailer `/Encrypt` naming the certificate handler, as a PubSec file carries. */
async function certificateEncrypted(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	doc.context.trailerInfo.Encrypt = doc.context.register(
		doc.context.obj({ Filter: PDFName.of('Adobe.PubSec'), SubFilter: PDFName.of('adbe.pkcs7.s4') })
	);
	return doc.save({ useObjectStreams: false });
}

/** Each file, the code the open refuses it under, and the code `sanitize` does. */
const FILES: [string, () => Promise<Uint8Array>, Refusal['code'], Refusal['code']][] = [
	[
		'bytes that are not a PDF',
		async () => new TextEncoder().encode('just words'),
		'not_pdf',
		'not_pdf'
	],
	['an empty file', async () => new Uint8Array(0), 'not_pdf', 'not_pdf'],
	['a PDF cut off halfway', async () => (await blank()).slice(0, 288), 'not_pdf', 'damaged'],
	['a PDF behind a user password', locked, 'password', 'password'],
	['a certificate-encrypted PDF', certificateEncrypted, 'encryption', 'encryption']
];

describe('a file pdf.js will not open', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(FILES)(
		'$0 is refused as $2',
		async (_, make, code) => {
			const bytes = await make();
			const refused = await openPdf(bytes).catch((err: unknown) => err);
			expect(refused).toBeInstanceOf(Refused);
			expect((refused as Refused).refusal).toEqual({ code });
		},
		60_000
	);

	it.each(FILES)(
		'$0 is refused as $3 by sanitize, which starts the qpdf worker and no other',
		async (_, make, __, code) => {
			const bytes = await make();
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

			expect(await sanitize(bytes)).toEqual({ ok: false, refusal: { code } });
			expect(started).toEqual(['qpdf.worker.js']);
		},
		60_000
	);

	it('refuses at the first open the importer makes', async () => {
		const refused = await xfaToAcroForm(await locked()).catch((err: unknown) => err);
		expect(refused).toBeInstanceOf(Refused);
		expect((refused as Refused).refusal).toEqual({ code: 'password' });
	}, 60_000);
});
