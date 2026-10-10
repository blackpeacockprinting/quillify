/**
 * What the importer declines, and in what words. A refusal is the only thing the
 * person sees when a file will not go through, so each of these says what the
 * file is and what to do about it, and each fires before the work it saves.
 */

import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { inventoryPdf, PdfImportRefusal } from './inventory.js';
import { MAX_BYTES, MAX_RASTER_BYTES, MAX_WIDGETS } from './types.js';

/** Noise, because it is what does not compress. A scan behaves the same way. */
async function noisyPdf(pages: number): Promise<Uint8Array> {
	const canvas = new OffscreenCanvas(816, 1056);
	const ctx = canvas.getContext('2d')!;
	const image = ctx.createImageData(canvas.width, canvas.height);
	// getRandomValues caps at 64 KB a call, so fill in chunks.
	for (let i = 0; i < image.data.length; i += 65536)
		crypto.getRandomValues(image.data.subarray(i, Math.min(i + 65536, image.data.length)));
	ctx.putImageData(image, 0, 0);
	const jpg = new Uint8Array(
		await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })).arrayBuffer()
	);

	const pdf = await PDFDocument.create();
	const embedded = await pdf.embedJpg(jpg);
	for (let i = 0; i < pages; i++) {
		const page = pdf.addPage([612, 792]);
		page.drawImage(embedded, { x: 0, y: 0, width: 612, height: 792 });
	}
	return pdf.save();
}

describe('the raster budget', () => {
	it('refuses a scan whose pages are more than one request carries', async () => {
		const bytes = await noisyPdf(12);
		expect(bytes.byteLength, 'the file itself stays inside the size gate').toBeLessThan(MAX_BYTES);

		await expect(inventoryPdf(bytes)).rejects.toThrow(PdfImportRefusal);
		await expect(inventoryPdf(bytes)).rejects.toThrow(
			`more than ${MAX_RASTER_BYTES / 1024 / 1024} MB`
		);
	}, 120_000);
});

describe('the field cap', () => {
	it('names the whole count, and rasters nothing to find it', async () => {
		// The pages are noise, so if a single one were rastered before the cap was
		// read the raster budget would refuse first and this would fail on the
		// message. The count it names is the whole form's, not a running partial.
		const bytes = await noisyPdf(12);
		const pdf = await PDFDocument.load(bytes);
		const form = pdf.getForm();
		const over = MAX_WIDGETS + 10;
		for (let i = 0; i < over; i++)
			form
				.createTextField(`field_${i}`)
				.addToPage(pdf.getPage(0), { x: 10, y: 10 + (i % 70) * 10, width: 40, height: 8 });
		const withFields = await pdf.save();
		expect(withFields.byteLength).toBeLessThan(MAX_BYTES);

		await expect(inventoryPdf(withFields)).rejects.toThrow(
			`This form has ${over} fields; the importer reads up to ${MAX_WIDGETS} in one pass.`
		);
	}, 180_000);
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
