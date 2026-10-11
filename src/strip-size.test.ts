import { PDFDocument, PDFName, type PDFRef } from 'pdf-lib';
import { expect, it } from 'vitest';
import { stripAcroForm } from './strip.js';

it('strips a file whose page reaches 150,000 objects', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const { context } = doc;
	let next: PDFRef | undefined;
	for (let i = 0; i < 150_000; i++)
		next = context.register(context.obj(next ? { Next: next } : {}));
	page.node.set(PDFName.of('Group'), next!);

	await expect(stripAcroForm(await doc.save())).resolves.toBeInstanceOf(Uint8Array);
}, 180_000);
