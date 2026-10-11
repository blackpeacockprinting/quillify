/**
 * Writes test/fixtures/acroform-sample.pdf: one Letter page with three text
 * fields, a checkbox, a dropdown and a Link annotation, the synthetic form the
 * tests read beside the published ones.
 */

import { writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();

const label = (text, y) => page.drawText(text, { x: 72, y: y + 5, size: 11, font });

page.drawText('Sample Application', { x: 72, y: 730, size: 18, font });

label('Full name', 680);
form.createTextField('FullName').addToPage(page, { x: 200, y: 676, width: 300, height: 22 });
label('Email', 640);
form.createTextField('Email').addToPage(page, { x: 200, y: 636, width: 300, height: 22 });
label('Comments', 600);
const comments = form.createTextField('Comments');
comments.enableMultiline();
comments.addToPage(page, { x: 200, y: 520, width: 300, height: 80 });
label('Agree to terms', 480);
form.createCheckBox('Agree').addToPage(page, { x: 200, y: 478, width: 16, height: 16 });
label('Favorite color', 440);
const color = form.createDropdown('FavoriteColor');
color.addOptions(['red', 'green', 'blue']);
color.addToPage(page, { x: 200, y: 436, width: 200, height: 22 });

page.drawText('tonguetoquill.com', { x: 72, y: 100, size: 11, font, color: rgb(0, 0, 0.6) });
const link = doc.context.obj({
	Type: 'Annot',
	Subtype: 'Link',
	Rect: [72, 96, 180, 114],
	Border: [0, 0, 0],
	A: { Type: 'Action', S: 'URI', URI: 'https://www.tonguetoquill.com' }
});
page.node.set(
	PDFName.of('Annots'),
	doc.context.obj([...page.node.Annots().asArray(), doc.context.register(link)])
);

writeFileSync('test/fixtures/acroform-sample.pdf', await doc.save({ useObjectStreams: false }));
console.log('wrote test/fixtures/acroform-sample.pdf');
