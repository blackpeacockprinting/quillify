/**
 * A file pdf.js will not open is refused at the open, under a code the caller
 * can branch on. pdf.js's own message ("No password given", "Invalid PDF
 * structure.") reads as a crash for a file a stage is only declining.
 */

import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
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

describe('a file pdf.js will not open', () => {
	it.each([
		['bytes that are not a PDF', async () => new TextEncoder().encode('just words'), 'not_pdf'],
		['an empty file', async () => new Uint8Array(0), 'not_pdf'],
		['a PDF cut off halfway', async () => (await blank()).slice(0, 288), 'not_pdf'],
		['a PDF behind a user password', locked, 'password'],
		['a certificate-encrypted PDF', certificateEncrypted, 'encryption']
	])(
		'$0 is refused as $2',
		async (_, make, code) => {
			const bytes = await make();
			const refused = await openPdf(bytes).catch((err: unknown) => err);
			expect(refused).toBeInstanceOf(Refused);
			expect((refused as Refused).refusal).toEqual({ code });
		},
		60_000
	);

	it('refuses at the first open the importer makes', async () => {
		const refused = await xfaToAcroForm(await locked()).catch((err: unknown) => err);
		expect(refused).toBeInstanceOf(Refused);
		expect((refused as Refused).refusal).toEqual({ code: 'password' });
	}, 60_000);
});
