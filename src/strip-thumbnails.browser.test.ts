import { PDFDocument, PDFName } from 'pdf-lib';
import { expect, it } from 'vitest';
import beneficiaryUrl from '../test/fixtures/SF1152_Designation_of_Beneficiary_Unpaid_Compensation.pdf?url';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';

/** How many pages a PDF has, and how many of them hold a thumbnail. */
async function thumbnails(bytes: Uint8Array) {
	const pages = (await PDFDocument.load(bytes)).getPages();
	return [pages.length, pages.filter((page) => page.node.has(PDFName.of('Thumb'))).length];
}

it('leaves no thumbnail in the background of SF 1152, which is published with one on each of its four pages', async () => {
	const source = await normalizePdf(
		new Uint8Array(await (await fetch(beneficiaryUrl)).arrayBuffer())
	);
	expect(await thumbnails(source)).toEqual([4, 4]);
	const { views } = await inventoryPdf(source);
	expect(await thumbnails(await stripAcroForm(source, views))).toEqual([4, 0]);
});
