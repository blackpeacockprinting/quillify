import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { expect, it } from 'vitest';
import { inventoryPdf } from './inventory.js';

it('leaves out a widget whose /FT names none of the four field types', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const form = doc.getForm();
	form.createTextField('kept').addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
	const other = form.createTextField('other');
	other.addToPage(page, { x: 72, y: 660, width: 200, height: 20 });
	other.acroField.dict.set(PDFName.of('FT'), PDFName.of('Foo'));

	const { widgets } = await inventoryPdf(await doc.save());
	expect(widgets.map(({ name, kind }) => [name, kind])).toEqual([['kept', 'Tx']]);
});

it('keeps only the string options of a choice', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const choice = doc.getForm().createDropdown('choice');
	choice.addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
	const { context } = doc;
	const pair = context.obj([
		context.obj([PDFString.of('a'), PDFString.of('b')]),
		PDFString.of('A')
	]);
	choice.acroField.dict.set(
		PDFName.of('Opt'),
		context.obj([PDFNumber.of(1), PDFString.of('x'), pair, PDFString.of('y')])
	);

	const { widgets } = await inventoryPdf(await doc.save());
	expect(widgets.map(({ options }) => options)).toEqual([['x', 'y']]);
});
