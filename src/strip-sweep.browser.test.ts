/**
 * The sweep at the end of the strip walks every array and dictionary the
 * catalog reaches, and a file sets how long each is.
 */

import { PDFDocument, PDFName, type PDFObject } from 'pdf-lib';
import { expect, it } from 'vitest';
import { sanitize } from './sanitize.js';

const ENTRIES = 200_000;

/** As many keys, each naming `entry`. */
const keyed = (entry: PDFObject) =>
	Object.fromEntries(Array.from({ length: ENTRIES }, (_, i) => [`K${i}`, entry]));

/** What a page's `/Group` holds, given a reference to one empty dictionary. */
const CASES = {
	'an array': ({ context }: PDFDocument, entry: PDFObject) =>
		context.obj(Array.from({ length: ENTRIES }, () => entry)),
	'a dictionary': ({ context }: PDFDocument, entry: PDFObject) => context.obj(keyed(entry)),
	"a stream's dictionary": ({ context }: PDFDocument, entry: PDFObject) =>
		context.register(context.stream('', keyed(entry)))
};

for (const [name, group] of Object.entries(CASES))
	it(`reads a file whose page reaches ${name} of 200,000 entries`, async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage([612, 792]);
		doc.getForm().createTextField('x').addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
		page.node.set(PDFName.of('Group'), group(doc, doc.context.register(doc.context.obj({}))));

		const sanitized = await sanitize(await doc.save());
		expect(sanitized).toMatchObject({ ok: true, form: { fields: [{ id: 'x' }] } });
	}, 60_000);
