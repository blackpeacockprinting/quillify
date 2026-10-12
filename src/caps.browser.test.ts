/**
 * The caps at the values the measurement of #201 gives them: a
 * form at the cap converts and one past it is refused. The numbers are written
 * out here so that a change of a constant has to change a test.
 */

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { dynamicForm, templateForm } from '../test/dynamic-form.js';
import { fromTree, render } from '../test/engine.js';
import { limits, quillify, sanitize, suggest } from './index.js';

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

it('exports the three limits, each the one its refusal carries', async () => {
	expect(limits).toEqual({ bytes: 8 * 1024 * 1024, pages: 25, fields: 1000 });
	expect(Object.isFrozen(limits)).toBe(true);
	expect(await sanitize(new Uint8Array(limits.bytes + 1))).toEqual({
		ok: false,
		refusal: { code: 'too_large', bytes: limits.bytes + 1, limit: limits.bytes }
	});
	expect(await sanitize(await built(limits.pages + 1, 1))).toEqual({
		ok: false,
		refusal: { code: 'too_many_pages', pages: limits.pages + 1, limit: limits.pages }
	});
	expect(await sanitize(await built(1, limits.fields + 1))).toEqual({
		ok: false,
		refusal: { code: 'too_many_fields', fields: limits.fields + 1, limit: limits.fields }
	});
}, 60_000);

it('converts a page 14,400 pt wide and refuses one of 14,401', async () => {
	const wide = async (width: number) => {
		const doc = await PDFDocument.create();
		const page = doc.addPage([width, 792]);
		doc.getForm().createTextField('field').addToPage(page, { x: 20, y: 20, width: 10, height: 8 });
		return doc.save();
	};
	expect(await sanitize(await wide(14400))).toMatchObject({
		ok: true,
		form: { pages: [{ width: 14400, height: 792 }] }
	});
	expect(await sanitize(await wide(14401))).toEqual({ ok: false, refusal: { code: 'damaged' } });
}, 60_000);

it('converts a page whose box reaches 14,400 pt from the origin and refuses one that reaches 14,401', async () => {
	const far = async (x: number, y: number) => {
		const doc = await PDFDocument.create();
		const page = doc.addPage();
		page.setMediaBox(x, y, 612, 792);
		doc
			.getForm()
			.createTextField('field')
			.addToPage(page, { x: x + 20, y: y + 20, width: 10, height: 8 });
		return doc.save();
	};
	for (const [x, y] of [
		[13788, 13608],
		[-14400, -14400]
	])
		expect(await sanitize(await far(x, y))).toMatchObject({
			ok: true,
			form: { pages: [{ width: 612, height: 792 }] }
		});
	for (const [x, y] of [
		[13789, 0],
		[0, 13609],
		[-14401, 0],
		[0, -14401]
	])
		expect(await sanitize(await far(x, y))).toEqual({ ok: false, refusal: { code: 'damaged' } });
}, 60_000);

it('converts a page 14,400 pt wide about the origin and refuses one of 14,600, no corner of either past 14,400 pt', async () => {
	const about = async (half: number) => {
		const doc = await PDFDocument.create();
		const page = doc.addPage();
		page.setMediaBox(-half, 0, 2 * half, 792);
		doc.getForm().createTextField('field').addToPage(page, { x: 20, y: 20, width: 10, height: 8 });
		return doc.save();
	};
	expect(await sanitize(await about(7200))).toMatchObject({
		ok: true,
		form: { pages: [{ width: 14400, height: 792 }] }
	});
	expect(await sanitize(await about(7300))).toEqual({ ok: false, refusal: { code: 'damaged' } });
}, 60_000);

it("converts a dynamic form's page 14,400 pt long and refuses one of 14,401", async () => {
	const long = (height: number) =>
		templateForm(
			`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="${height}pt"/><medium short="612pt" long="${height}pt"/></pageArea></pageSet><subform layout="position" w="612pt" h="792pt"><field name="field" x="20pt" y="20pt" w="10pt" h="8pt"><ui><textEdit/></ui></field></subform></subform></template>`
		);
	expect(await sanitize(await long(14400))).toMatchObject({
		ok: true,
		form: { pages: [{ width: 612, height: 14400 }] }
	});
	expect(await sanitize(await long(14401))).toEqual({ ok: false, refusal: { code: 'damaged' } });
}, 60_000);
