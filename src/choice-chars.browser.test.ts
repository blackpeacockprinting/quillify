/**
 * Engine 0.124.0 refuses an enum value that holds `;`, `>` or `|`, with
 * `quill::format_literal_reserved_char`. Measured over every code point of the
 * Basic Multilingual Plane in the middle of a value, and over printable ASCII
 * at the start, in the middle and at the end, no other character is refused for
 * that reason. A choice with such an option is written as a string field, so
 * the form still builds.
 *
 * The first test is a tripwire: the day the engine takes these characters in an
 * enum value it fails, and the rule in `assemble.ts` goes.
 */

import { isQuillmarkError } from '@quillmark/wasm';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { expectClosure } from '../test/closure.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

const encoder = new TextEncoder();

async function dropdownForm(rows: Record<string, string[]>): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const form = doc.getForm();
	for (const [n, [name, options]] of Object.entries(rows).entries()) {
		const dropdown = form.createDropdown(name);
		dropdown.addOptions(options);
		dropdown.addToPage(page, { x: 72, y: 700 - 40 * n, width: 200, height: 20 });
	}
	return doc.save({ updateFieldAppearances: false });
}

describe.each([';', '>', '|'])('an enum value with %s', (character) => {
	it('is refused by the engine, which is why a choice with one is written as a string', async () => {
		const blank = await PDFDocument.create();
		blank.addPage([612, 792]);
		const background = await blank.save();
		const yaml = [
			'quill:',
			'  name: tripwire',
			'  version: 0.1.0',
			'  backend: acroform',
			'  description: Tripwire.',
			'',
			'main:',
			'  body:',
			'    enabled: false',
			'  fields:',
			'    pick:',
			'      type: enum',
			'      values:',
			`        - ${JSON.stringify(`A${character}B`)}`,
			'      description: One row.'
		].join('\n');
		const tree = new Map<string, Uint8Array>([
			['Quill.yaml', encoder.encode(yaml + '\n')],
			['form.pdf', background],
			[
				'form.json',
				encoder.encode(JSON.stringify({ schema: 'quillmark/form@0.2.0', fields: [], widgets: [] }))
			]
		]);

		let code: string | undefined;
		try {
			await fromTree(tree);
		} catch (err) {
			if (!isQuillmarkError(err)) throw err;
			code = err.diagnostics[0].code;
		}
		expect(code).toBe('quill::format_literal_reserved_char');
	});
});

it('builds a dropdown with a row the engine refuses as a string, and renders a value typed into it', async () => {
	const rows = {
		Duration: ['Training >20 weeks', 'Other'],
		Plan: ['Plan; act', 'Other'],
		Side: ['Left|right', 'Other'],
		Marks: ['A<B', 'C, D', 'E: F', 'G/H']
	};
	const typed = { Duration: rows.Duration[0], Plan: rows.Plan[0], Side: rows.Side[0] };
	const sanitized = await sanitize(await dropdownForm(rows));
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	const { form } = sanitized;
	const naming = { name: 'x', description: 'A form.', fields: suggest(form.fields) };

	const quillified = await quillify(form, naming);
	if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
	const { ref, quill } = await fromTree(quillified.tree);

	const [duration, plan, side, marks] = naming.fields;
	const refused = { Duration: duration, Plan: plan, Side: side };
	const { fields } = quill.schema.main;
	for (const field of Object.values(refused)) expect(fields[field.name].type).toBe('string');
	expect(fields[marks.name].type).toBe('enum');
	expect(fields[marks.name].values).toEqual(rows.Marks);

	const example = quill.exampleDocument()!;
	const { payloadItems } = example.main;
	example.free();
	for (const [pdfName, field] of Object.entries(refused))
		expect(payloadItems).toContainEqual({
			type: 'field',
			key: field.name,
			value: typed[pdfName as keyof typeof typed]
		});

	const values = Object.entries(refused)
		.map(
			([pdfName, field]) =>
				`${field.name}: ${JSON.stringify(typed[pdfName as keyof typeof typed])}\n`
		)
		.join('');
	const markdown = `~~~\n$quill: ${ref}\n$kind: main\n${values}~~~\n`;
	const rendered = await render(quill, markdown);
	expect(await expectClosure(form.pages, quillified.tree, rendered)).toBe(4);
	const stamped = (await PDFDocument.load(rendered)).getForm();
	for (const [pdfName, text] of Object.entries(typed))
		expect(stamped.getTextField(pdfName).getText()).toBe(text);
}, 60_000);
