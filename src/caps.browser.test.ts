/**
 * The caps at the values the measurement in `prose/DECISIONS.md` gives them: a
 * form at the cap converts and one past it is refused. The numbers are written
 * out here so that a change of a constant has to change a test.
 */

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

/** Text fields on `pages` pages, `fields` of them on the first. */
async function built(pages: number, fields: number) {
	const doc = await PDFDocument.create();
	const form = doc.getForm();
	for (let page = 0; page < pages; page++) doc.addPage([612, 792]);
	for (let i = 0; i < fields; i++)
		form.createTextField(`field_${i}`).addToPage(doc.getPage(0), {
			x: 20 + (i % 50) * 11,
			y: 20 + Math.floor(i / 50) * 9,
			width: 10,
			height: 8
		});
	return doc.save();
}

it('converts a form of 1,000 fields and refuses one of 1,001', async () => {
	expect(await sanitize(await built(1, 1000))).toMatchObject({
		ok: true,
		form: { fields: { length: 1000 } }
	});
	expect(await sanitize(await built(1, 1001))).toEqual({
		ok: false,
		refusal: { code: 'too_many_fields', fields: 1001, limit: 1000 }
	});
}, 60_000);

it('converts a dynamic form of 1,000 fields', async () => {
	const fields = Array.from(
		{ length: 1000 },
		(_, i) =>
			`<field name="field_${i}" x="${20 + (i % 50) * 11}pt" y="${20 + Math.floor(i / 50) * 9}pt" w="10pt" h="8pt"><ui><textEdit/></ui></field>`
	);
	const read = await sanitize(await dynamicForm(fields.join('')));
	expect(read).toMatchObject({ ok: true, form: { fields: { length: 1000 } } });
}, 60_000);

it('gives the engine a quill of 1,000 fields it takes', async () => {
	const read = await sanitize(await built(1, 1000));
	if (!read.ok) throw new Error(`refused as ${read.refusal.code}`);
	const { form } = read;
	const made = await quillify(form, {
		name: 'caps',
		description: 'A form of 1,000 fields.',
		fields: suggest(form.fields)
	});
	if (!made.ok) throw new Error(`problems: ${JSON.stringify(made.problems)}`);
	const { ref, quill } = await fromTree(made.tree);
	const rendered = await render(quill, `~~~\n$quill: ${ref}\n$kind: main\n~~~\n`);
	quill.free();
	expect(rendered.byteLength).toBeGreaterThan(0);
}, 60_000);

it('converts a form of 25 pages and refuses one of 26', async () => {
	expect(await sanitize(await built(25, 1))).toMatchObject({
		ok: true,
		form: { pages: { length: 25 } }
	});
	expect(await sanitize(await built(26, 1))).toEqual({
		ok: false,
		refusal: { code: 'too_many_pages', pages: 26, limit: 25 }
	});
}, 60_000);
