import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFString,
	decodePDFRawStream,
	type PDFRawStream,
	type PDFRef
} from 'pdf-lib';
import { expect, it } from 'vitest';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import { normalizePdf } from './normalize.js';
import { xfaToAcroForm } from './xfa.js';

/** DD 2875 with one caption of its XFA template reworded. */
async function recaptioned(from: string, to: string): Promise<Uint8Array> {
	const published = new Uint8Array(await (await fetch(saarUrl)).arrayBuffer());
	const doc = await PDFDocument.load(published, { updateMetadata: false });
	const packets = doc.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.lookup(PDFName.of('XFA'), PDFArray)
		.asArray();
	const named = packets.findIndex(
		(part) => part instanceof PDFString && part.asString() === 'template'
	);
	const template = packets[named + 1] as PDFRef;
	const xml = new TextDecoder().decode(
		decodePDFRawStream(doc.context.lookup(template) as PDFRawStream).decode()
	);
	expect(xml.split(from), `captions that read "${from}"`).toHaveLength(2);
	doc.context.assign(
		template,
		doc.context.flateStream(new TextEncoder().encode(xml.replace(from, to)))
	);
	return doc.save();
}

it('refuses a dynamic form by the page and the run that hold a character the standard fonts cannot encode', async () => {
	const bytes = await recaptioned('21. OPTIONAL INFORMATION', '21. OPTIONAL INFORMATION Ω');
	await expect(xfaToAcroForm(await normalizePdf(bytes))).rejects.toMatchObject({
		refusal: {
			code: 'unpaintable',
			page: 1,
			construct: 'glyph',
			detail: '21. OPTIONAL INFORMATION Ω'
		}
	});
}, 120_000);
