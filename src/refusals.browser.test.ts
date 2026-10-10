/**
 * What the importer declines, and in what words. A refusal is the only thing the
 * person sees when a file will not go through, so each of these says what the
 * file is and what to do about it, and each fires before the work it saves.
 */

import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { inventoryPdf, PdfImportRefusal } from './inventory.js';
import { MAX_WIDGETS } from './types.js';

describe('the field cap', () => {
	it('names the whole count', async () => {
		const pdf = await PDFDocument.create();
		pdf.addPage([612, 792]);
		const form = pdf.getForm();
		const over = MAX_WIDGETS + 10;
		for (let i = 0; i < over; i++)
			form
				.createTextField(`field_${i}`)
				.addToPage(pdf.getPage(0), { x: 10, y: 10 + (i % 70) * 10, width: 40, height: 8 });

		await expect(inventoryPdf(await pdf.save())).rejects.toThrow(
			`This form has ${over} fields; the importer reads up to ${MAX_WIDGETS} in one pass.`
		);
	});
});

describe('a wrapper document', () => {
	it('says the form is an attachment rather than that it has no fields', async () => {
		// A catalog carrying /Collection is a portfolio or an encrypted-payload
		// wrapper, and page one is a cover sheet by construction. Counting its
		// widgets answers the wrong question and tells the person their form has
		// no fields when it has plenty, inside.
		const pdf = await PDFDocument.create();
		pdf.addPage([612, 792]);
		await pdf.attach(new TextEncoder().encode('the real form'), 'AF Form 3070A.pdf', {
			mimeType: 'application/pdf'
		});
		// pdf.js reads the catalog's /Collection and ignores an empty dictionary,
		// so this carries the /View a real portfolio does.
		pdf.catalog.set(
			PDFName.of('Collection'),
			pdf.context.obj({ View: PDFName.of('D') }) as PDFDict
		);

		await expect(inventoryPdf(await pdf.save())).rejects.toThrow(PdfImportRefusal);
		await expect(inventoryPdf(await pdf.save())).rejects.toThrow(
			'rides inside it as an attachment (AF Form 3070A.pdf)'
		);
	}, 60_000);
});
