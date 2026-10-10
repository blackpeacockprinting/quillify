/**
 * Real government forms arrive locked, and pdf-lib carries no decryption. qpdf
 * runs first so the inventory and the background strip read the same decrypted
 * bytes.
 */

import { describe, expect, it } from 'vitest';
import formUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import { PDFDocument } from 'pdf-lib';
import { normalizePdf } from './normalize.js';
import { inventoryPdf, PdfImportRefusal } from './inventory.js';
import { MAX_BYTES } from './types.js';

async function form(): Promise<Uint8Array> {
	return new Uint8Array(await (await fetch(formUrl)).arrayBuffer());
}

describe('normalizePdf', () => {
	it('hands pdf-lib a file it can open, where the original throws', async () => {
		const original = await form();
		await expect(PDFDocument.load(original)).rejects.toThrow();

		const normalized = await normalizePdf(original);
		const doc = await PDFDocument.load(normalized);
		expect(doc.isEncrypted).toBe(false);
		expect(doc.getPageCount()).toBe(3);
	}, 60_000);

	it('leaves the widgets where the reader found them', async () => {
		const normalized = await normalizePdf(await form());
		const inventory = await inventoryPdf(normalized);

		expect(inventory.widgets.length).toBeGreaterThan(30);
		expect(inventory.pages).toHaveLength(3);
		for (const widget of inventory.widgets) {
			for (const place of widget.places) {
				expect(place.rect.w).toBeGreaterThan(0);
				expect(place.rect.h).toBeGreaterThan(0);
				expect(place.page).toBeLessThan(3);
			}
		}
	}, 120_000);

	it('refuses a file over the ceiling before qpdf allocates for it', async () => {
		await expect(normalizePdf(new Uint8Array(MAX_BYTES + 1))).rejects.toThrow(/over 8 MB/);
	});

	it('refuses a file qpdf cannot rewrite, and takes the next one', async () => {
		// Everything downstream reads these bytes as decrypted and coalesced, so
		// the input handed back unchanged would be read under a promise nobody kept.
		const refused = await normalizePdf(new TextEncoder().encode('just words')).catch(
			(err: unknown) => err
		);
		expect(refused).toBeInstanceOf(PdfImportRefusal);
		expect((refused as Error).message).toBe('This file is not a PDF the reader can open.');

		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		const next = await PDFDocument.load(await normalizePdf(await doc.save()));
		expect(next.getPageCount()).toBe(1);
	}, 60_000);

	it('refuses a file the reader opens and qpdf rejects', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		const saved = await doc.save({ useObjectStreams: false });
		// One character per byte, so the index is a byte offset. The offset written
		// after it points at no cross-reference table: the reader rebuilds the
		// table from the objects, and qpdf writes nothing.
		const at = new TextDecoder('latin1').decode(saved).lastIndexOf('startxref');
		const tail = new TextEncoder().encode('startxref\n7\n%%EOF\n');
		const damaged = new Uint8Array(at + tail.length);
		damaged.set(saved.subarray(0, at));
		damaged.set(tail, at);

		const refused = await normalizePdf(damaged).catch((err: unknown) => err);
		expect(refused).toBeInstanceOf(PdfImportRefusal);
		expect((refused as Error).message).toBe(
			'This PDF could not be read. Open it in a PDF reader, save a fresh copy, and import that.'
		);
	}, 60_000);
});
