/**
 * The inventory reads the tooltip a widget inherits from its field off the
 * field tree. Each file here is one pdf.js reads and pdf-lib's form API throws
 * on, or warns about, and `sanitize` answers for it.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNumber,
	PDFRef,
	PDFString
} from 'pdf-lib';
import type { PDFTextField } from 'pdf-lib';
import { expect, it, vi } from 'vitest';
import tdyUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import { sanitize } from './sanitize.js';

const FT = PDFName.of('FT');
const T = PDFName.of('T');
const TU = PDFName.of('TU');

/**
 * A page with two text fields, `odd` ahead of `kept` in `/Fields`. Each has its
 * tooltip on the field and a bare widget as its kid, so a tooltip that comes
 * back was read off the tree.
 */
async function built(change: (doc: PDFDocument, odd: PDFTextField) => void) {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const [odd] = ['odd', 'kept'].map((name, index) => {
		const field = doc.getForm().createTextField(name);
		field.addToPage(page, { x: 72, y: 700 - 40 * index, width: 200, height: 20 });
		field.acroField.dict.set(TU, PDFString.of(`Tip of ${name}`));
		return field;
	});
	change(doc, odd!);
	return doc.save({ updateFieldAppearances: false });
}

/** Each field `sanitize` returns, as its id, its kind and its tooltip. */
async function read(pdf: Uint8Array) {
	const sanitized = await sanitize(pdf);
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	return sanitized.form.fields.map(({ id, kind, tooltip }) => [id, kind, tooltip]);
}

const listed = (doc: PDFDocument) =>
	doc.getForm().acroForm.dict.lookup(PDFName.of('Fields'), PDFArray);

/** Puts the first entry of `/Fields` under a new node, ahead of `kids`, and the node in its place. */
function under(doc: PDFDocument, entries: Record<string, PDFString | string>, ...kids: PDFRef[]) {
	const fields = listed(doc);
	const node = doc.context.register(
		doc.context.obj({ ...entries, Kids: [fields.get(0), ...kids] })
	);
	fields.lookup(0, PDFDict).set(PDFName.of('Parent'), node);
	fields.set(0, node);
	return node;
}

const both = [
	['odd', 'text', 'Tip of odd'],
	['kept', 'text', 'Tip of kept']
];
const keptAlone = [['kept', 'text', 'Tip of kept']];
const underA = [['a.odd', 'text', 'Tip of odd'], ...keptAlone];

it.each<[string, (doc: PDFDocument, odd: PDFTextField) => void, unknown[][]]>([
	['whose /FT is a string', (_, odd) => odd.acroField.dict.set(FT, PDFString.of('Tx')), keptAlone],
	['whose /FT is a number', (_, odd) => odd.acroField.dict.set(FT, PDFNumber.of(1)), keptAlone],
	[
		'whose /FT is on its widget alone',
		(_, odd) => {
			odd.acroField.dict.delete(FT);
			odd.acroField.getWidgets()[0]!.dict.set(FT, PDFName.of('Tx'));
		},
		both
	],
	['that is its own kid', (_, odd) => odd.acroField.Kids()!.push(odd.ref), both],
	[
		'under a field, beside a dictionary with no /T, no /Parent and no /FT',
		(doc) => under(doc, { T: PDFString.of('a') }, doc.context.register(doc.context.obj({}))),
		underA
	],
	[
		'under a field that has a tooltip and a bare widget of its own',
		(doc) => {
			const widget = doc.context.obj({ Subtype: 'Widget', Rect: [72, 600, 272, 620] });
			const ref = doc.context.register(widget);
			doc.getPage(0).node.addAnnot(ref);
			const a = { T: PDFString.of('a'), TU: PDFString.of('Tip of a'), FT: 'Tx' };
			widget.set(PDFName.of('Parent'), under(doc, a, ref));
		},
		[...underA, ['a', 'text', 'Tip of a']]
	],
	[
		'under a node with no /T, under a field',
		(doc) => {
			under(doc, {});
			under(doc, { T: PDFString.of('a') });
		},
		underA
	],
	[
		'with no /T',
		(_, odd) => odd.acroField.dict.delete(T),
		[['', 'text', 'Tip of odd'], ...keptAlone]
	],
	[
		'that has a bare widget ahead of one with a tooltip of its own',
		(doc, odd) => {
			odd.addToPage(doc.getPage(0), { x: 300, y: 700, width: 200, height: 20 });
			odd.acroField.getWidgets()[1]!.dict.set(TU, PDFString.of('Own'));
		},
		both
	]
])('reads a form with a field %s', async (_, change, fields) => {
	expect(await read(await built(change))).toEqual(fields);
});

it.each<[string, (doc: PDFDocument) => void]>([
	['names no object', (doc) => listed(doc).insert(0, PDFRef.of(9999))],
	['is a number', (doc) => listed(doc).insert(0, PDFNumber.of(1))]
])('reads a form whose first entry of /Fields %s', async (_, change) => {
	expect(await read(await built(change))).toEqual(both);
});

it('reads a form whose /AcroForm is a number, with no tooltip to inherit', async () => {
	const pdf = await built((doc) => doc.catalog.set(PDFName.of('AcroForm'), PDFNumber.of(1)));
	expect(await read(pdf)).toEqual([
		['odd', 'text', undefined],
		['kept', 'text', undefined]
	]);
});

const utf16 = (text: string, little = false) =>
	Array.from(text, (character) => {
		const unit = character.charCodeAt(0).toString(16).padStart(4, '0');
		return little ? unit.slice(2) + unit.slice(0, 2) : unit;
	}).join('');

it.each([
	['PDFDocEncoding in a literal string', PDFString.of('caf\\351 \\200')],
	['PDFDocEncoding in a hex string', PDFHexString.of('636166E92080')],
	['UTF-16 after FE FF', PDFHexString.of(`FEFF${utf16('café •')}`)],
	['UTF-16 after FF FE', PDFHexString.of(`FFFE${utf16('café •', true)}`)]
])('reads a tooltip written as %s', async (_, tooltip) => {
	const pdf = await built((_, odd) => odd.acroField.dict.set(TU, tooltip));
	expect(await read(pdf)).toEqual([['odd', 'text', 'café •'], ...keptAlone]);
});

it.each<[number, string, (length: number) => PDFString | PDFHexString]>([
	[130_000, 'a literal string', (length) => PDFString.of('x'.repeat(length))],
	[130_000, 'a hex string', (length) => PDFHexString.of('78'.repeat(length))],
	[130_000, 'UTF-16', (length) => PDFHexString.of(`FEFF${'0078'.repeat(length)}`)],
	[2_000_000, 'a literal string', (length) => PDFString.of('x'.repeat(length))]
])(
	'returns a tooltip of %i characters whole, written as %s',
	async (length, _, tooltip) => {
		const pdf = await built((_, odd) => odd.acroField.dict.set(TU, tooltip(length)));
		const [[, , returned]] = await read(pdf);
		expect(returned === 'x'.repeat(length)).toBe(true);
	},
	60_000
);

it('writes nothing to the console for DD 1610, a hybrid form', async () => {
	const warn = vi.spyOn(console, 'warn');
	const sanitized = await sanitize(new Uint8Array(await (await fetch(tdyUrl)).arrayBuffer()));
	expect(sanitized.ok).toBe(true);
	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});
