import { expect, it } from 'vitest';
import { templateForm } from '../test/dynamic-form.js';
import { sanitize } from './sanitize.js';

/** A page-high subform with one text field. */
const sheet = (name: string) =>
	`<subform name="${name}" layout="position" w="612pt" h="792pt"><field name="f" x="72pt" y="72pt" w="200pt" h="20pt"><ui><textEdit/></ui></field></subform>`;

it('gives a second page to a form whose one page area may occur once in its page set', async () => {
	const read = await sanitize(
		await templateForm(
			`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/><occur max="1"/></pageArea></pageSet>${sheet('a')}${sheet('b')}</subform></template>`
		)
	);
	if (!read.ok) throw new Error(`refused as ${read.refusal.code}`);
	expect(read.form.pages).toEqual([
		{ width: 612, height: 792 },
		{ width: 612, height: 792 }
	]);
	const rect = { x: 72, y: 72, w: 200, h: 20 };
	expect(read.form.fields.map(({ id, kind, places }) => ({ id, kind, places }))).toEqual([
		{ id: 'p1.Page1.form1.a.f', kind: 'text', places: [{ page: 0, rect }] },
		{ id: 'p2.Page1.form1.b.f', kind: 'text', places: [{ page: 1, rect }] }
	]);
});

const label = '<draw w="100pt" h="20pt"><value><text>x</text></value></draw>';
/** A cell lower than the field in it. */
const cell =
	'<subform name="cell" layout="lr-tb" w="100pt" h="10pt"><field name="f" w="20pt" h="20pt"><ui><textEdit/></ui></field></subform>';

it.each([
	[
		'a table whose overflow leader is a row',
		`<subform name="t" layout="table" columnWidths="100pt 100pt"><overflow leader="head"/><subform name="head" layout="row">${label}${label}</subform><subform name="row" layout="row">${cell}${label}</subform></subform>`
	],
	[
		'a subform whose overflow leader is a subform around a draw',
		`<subform name="t" layout="tb"><overflow leader="head"/><subform name="head" layout="tb">${label}</subform><subform name="row" layout="tb">${cell}</subform></subform>`
	]
])(
	'finishes %s, before a row that cannot fit',
	async (_, table) => {
		const read = await sanitize(
			await templateForm(
				`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/></pageArea></pageSet>${table}</subform></template>`
			)
		);
		if (!read.ok) throw new Error(`refused as ${read.refusal.code}`);
		expect(read.form.pages).toHaveLength(2);
		expect(read.form.fields.map(({ id, places }) => [id, places[0].page])).toEqual([
			['p2.Page1.form1.t.row.cell.f', 1]
		]);
	},
	20_000
);
