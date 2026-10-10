/**
 * A file pdf.js will not open is refused at the open, in a sentence the person
 * can act on. pdf.js's own message ("No password given", "Invalid PDF
 * structure.") reads as a crash for a file the app is only declining.
 */

import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfImportRefusal } from './inventory.js';
import { openPdf } from './pdfjs.js';
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

const NOT_A_PDF = 'This file is not a PDF the reader can open.';

describe('a file pdf.js will not open', () => {
	it.each([
		['bytes that are not a PDF', async () => new TextEncoder().encode('just words'), NOT_A_PDF],
		['an empty file', async () => new Uint8Array(0), NOT_A_PDF],
		['a PDF cut off halfway', async () => (await blank()).slice(0, 288), NOT_A_PDF],
		[
			'a PDF behind a user password',
			locked,
			'This PDF is password protected. Remove the password first.'
		],
		[
			'a certificate-encrypted PDF',
			certificateEncrypted,
			'This PDF uses an encryption this app cannot open'
		]
	])(
		'%s is refused in words',
		async (_, make, words) => {
			const bytes = await make();
			const refused = await openPdf(bytes).catch((err: unknown) => err);
			expect(refused).toBeInstanceOf(PdfImportRefusal);
			expect((refused as Error).message).toContain(words);
		},
		60_000
	);

	it('refuses at the first open the importer makes', async () => {
		const refused = await xfaToAcroForm(await locked()).catch((err: unknown) => err);
		expect(refused).toBeInstanceOf(PdfImportRefusal);
		expect((refused as Error).message).toBe(
			'This PDF is password protected. Remove the password first.'
		);
	}, 60_000);
});
