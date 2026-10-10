/**
 * A widget whose `/Subtype` is an indirect reference is a widget all the same:
 * pdf.js inventories its field, and the engine refuses a background that still
 * has it on a page.
 */

import { PDFDocument, PDFName } from 'pdf-lib';
import { expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { assembleQuill } from './assemble.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';

it('builds a quill the engine fills once, from a widget that names its subtype by reference', async () => {
	const doc = await PDFDocument.create();
	const field = doc.getForm().createTextField('unit');
	field.addToPage(doc.addPage([612, 792]), { x: 72, y: 700, width: 200, height: 20 });
	const [widget] = field.acroField.getWidgets();
	widget.dict.set(PDFName.of('Subtype'), doc.context.register(PDFName.of('Widget')));

	const source = await normalizePdf(await doc.save({ useObjectStreams: false }));
	const inventory = await inventoryPdf(source);
	expect(inventory.widgets.map(({ id }) => id)).toEqual(['unit']);
	const { quill } = await fromTree(
		assembleQuill(
			{
				quill: { name: 'indirect', title: 'Indirect', description: 'One text field.' },
				fields: [
					{
						widget: 'unit',
						name: 'unit',
						label: 'Unit',
						description: '',
						type: 'string',
						multiline: false,
						example: 'Example Squadron',
						keep: true,
						required: false
					}
				]
			},
			inventory,
			await stripAcroForm(source)
		)
	);

	const example = quill.exampleDocument()!;
	const markdown = example.toMarkdown();
	example.free();
	const filled = (await PDFDocument.load(await render(quill, markdown))).getForm();
	expect(filled.getFields().map((stamped) => stamped.getName())).toEqual(['unit']);
	expect(filled.getTextField('unit').getText()).toBe('Example Squadron');
}, 60_000);
