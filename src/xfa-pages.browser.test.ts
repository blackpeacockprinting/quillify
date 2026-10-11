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
