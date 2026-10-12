import { PDFDocument, PDFName } from 'pdf-lib';
import { expect, it } from 'vitest';
import { sharedNameCheckboxes } from '../test/shared-name-checkboxes.js';
import { sanitize } from './index.js';
import { MAX_BYTES } from './types.js';
import type { Form } from './index.js';
import type { FieldInventory } from './types.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});
const goldens = import.meta.glob<FieldInventory>('../test/goldens/*.inventory.json', {
	import: 'default',
	eager: true
});
const named = (path: string) => path.slice(path.lastIndexOf('/') + 1);

async function fixture(name: string): Promise<Uint8Array> {
	const [, url] = Object.entries(fixtures).find(([path]) => named(path).startsWith(name))!;
	return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** The form a fixture sanitizes to. A refusal fails the case that asks. */
async function formOf(name: string): Promise<Form> {
	const sanitized = await sanitize(await fixture(name));
	if (!sanitized.ok) throw new Error(`${name} was refused as ${sanitized.refusal.code}`);
	return sanitized.form;
}

for (const [path, golden] of Object.entries(goldens)) {
	const name = named(path).replace('.inventory.json', '');
	it(`${name} sanitizes to the pages of its golden inventory and one field per widget`, async () => {
		const form = await formOf(`${name}_`);
		expect(form.pages).toEqual(golden.pages);
		expect(form.fields).toHaveLength(golden.widgets.length);
		// Key for key: a field carries what its kind has and nothing of the inventory's own.
		for (const [index, widget] of golden.widgets.entries()) {
			const { id, places, required, readOnly, tooltip } = widget;
			const own = {
				Tx: {
					kind: 'text',
					multiline: widget.multiLine,
					...(widget.maxLen > 0 ? { maxLength: widget.maxLen } : {})
				},
				Btn: widget.radioButton
					? { kind: 'radio', group: widget.name, on: widget.buttonValue }
					: { kind: 'checkbox' },
				Ch: { kind: 'choice', options: widget.options },
				Sig: { kind: 'signature' }
			}[widget.kind];
			expect(form.fields[index], id).toStrictEqual({
				id,
				places,
				required,
				readOnly,
				...(tooltip === undefined ? {} : { tooltip }),
				...own
			});
		}
	}, 120_000);
}

it.each([
	['DD577', { text: 19, radio: 12, signature: 4 }],
	['DAF1288', { text: 52, checkbox: 31, radio: 26, choice: 7, signature: 6 }]
])(
	'%s sanitizes to this many fields of each kind',
	async (name, kinds) => {
		const counted: Record<string, number> = {};
		for (const { kind } of (await formOf(`${name}_`)).fields)
			counted[kind] = (counted[kind] ?? 0) + 1;
		expect(counted).toEqual(kinds);
	},
	120_000
);

it('gives a radio button its group, and an on-state only when the file has one', async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const group = doc.getForm().createRadioGroup('pick');
	const box = { x: 72, width: 12, height: 12, borderWidth: 0 };
	group.addOptionToPage('first', page, { ...box, y: 700 });
	group.addOptionToPage('second', page, { ...box, y: 680 });
	const [, second] = group.acroField.getWidgets();
	second.dict.delete(PDFName.of('AP'));
	second.dict.delete(PDFName.of('AS'));

	const sanitized = await sanitize(await doc.save());
	const button = { required: false, readOnly: false, kind: 'radio', group: 'pick' };
	expect(sanitized).toMatchObject({ ok: true });
	expect(sanitized.ok && sanitized.form.fields).toStrictEqual([
		{
			...button,
			id: 'pick',
			places: [{ page: 0, rect: { x: 72, y: 80, w: 12, h: 12 } }],
			on: 'first'
		},
		{ ...button, id: 'pick#2', places: [{ page: 0, rect: { x: 72, y: 100, w: 12, h: 12 } }] }
	]);
});

it('gives the checkboxes of one name a field each when their on-states differ', async () => {
	const sanitized = await sanitize(await sharedNameCheckboxes());
	const at = (y: number) => ({ page: 0, rect: { x: 72, y, w: 12, h: 12 } });
	const box = { required: false, readOnly: false };
	const attached = { ...box, kind: 'radio', group: 'attached' };
	const twice = { ...box, kind: 'radio', group: 'twice' };
	expect(sanitized).toMatchObject({ ok: true });
	expect(sanitized.ok && sanitized.form.fields).toStrictEqual([
		{ ...attached, id: 'attached', places: [at(80)], on: 'is' },
		{ ...attached, id: 'attached#2', places: [at(100)], on: 'is_not' },
		// One on-state is one box painted twice, as SF 1152 paints each of its own.
		{ ...box, id: 'copy', places: [at(140), at(160)], kind: 'checkbox' },
		// Within a name of several on-states, two boxes of one state stay apart.
		{ ...twice, id: 'twice', places: [at(200)], on: 'one' },
		{ ...twice, id: 'twice#2', places: [at(220)], on: 'two' },
		{ ...twice, id: 'twice#3', places: [at(240)], on: 'one' }
	]);
});

// DD 1610 comes through the XFA stage as it went in. DAF 1288 is redrawn there, from one page to two.
it.each(['DD1610', 'DAF1288'])(
	'%s comes back with a background of its pages, with no form and no widget',
	async (name) => {
		const form = await formOf(`${name}_`);
		const background = await PDFDocument.load(form.pdf);
		expect(background.catalog.has(PDFName.of('AcroForm'))).toBe(false);
		expect(background.getPageCount()).toBe(form.pages.length);
		const annotations = background
			.getPages()
			.flatMap((page) => page.node.Annots()?.asArray() ?? [])
			.map((annotation) => String(background.context.lookup(annotation)));
		expect(annotations.filter((annotation) => annotation.includes('/Widget'))).toEqual([]);
	},
	120_000
);

it('returns a refusal as a value: the sample with every field removed', async () => {
	const doc = await PDFDocument.load(await fixture('acroform-sample'));
	const form = doc.getForm();
	for (const field of form.getFields()) form.removeField(field);
	expect(doc.catalog.has(PDFName.of('AcroForm'))).toBe(true);
	await expect(sanitize(await doc.save())).resolves.toEqual({
		ok: false,
		refusal: { code: 'no_fields', xfa: false }
	});
});

it('returns a refusal as a value: bytes that are not a PDF', async () => {
	await expect(sanitize(new TextEncoder().encode('just words'))).resolves.toEqual({
		ok: false,
		refusal: { code: 'not_pdf' }
	});
});

it('returns a refusal as a value: a file over the size cap', async () => {
	await expect(sanitize(new Uint8Array(MAX_BYTES + 1))).resolves.toEqual({
		ok: false,
		refusal: { code: 'too_large', bytes: MAX_BYTES + 1, limit: MAX_BYTES }
	});
});

it('lets an error that is no refusal through', async () => {
	const bytes = new Uint8Array(8);
	Object.defineProperty(bytes, 'byteLength', {
		get: () => {
			throw new RangeError('no refusal');
		}
	});
	await expect(sanitize(bytes)).rejects.toThrow(RangeError);
});

it('takes the bytes as a Uint8Array: a good file as an ArrayBuffer is an error', async () => {
	const { buffer } = await fixture('DD689_');
	await expect(sanitize(buffer as never)).rejects.toThrow(TypeError);
});

it.each([
	['Int8Array', Int8Array],
	['Uint8ClampedArray', Uint8ClampedArray]
])('takes only a Uint8Array: %s is an error', async (_, View) => {
	const { buffer } = await fixture('acroform-sample');
	await expect(sanitize(new View(buffer as ArrayBuffer) as never)).rejects.toThrow(
		'sanitize takes a Uint8Array.'
	);
});

it('takes a Uint8Array that another frame made', async () => {
	const frame = document.body.appendChild(document.createElement('iframe'));
	const other = frame.contentWindow as Window & typeof globalThis;
	const bytes = other.Uint8Array.from(await fixture('DD689_'));
	expect(bytes instanceof Uint8Array).toBe(false);
	await expect(sanitize(bytes)).resolves.toMatchObject({ ok: true });
	frame.remove();
});
