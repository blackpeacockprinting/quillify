import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

const caption = (says: string) =>
	`<caption placement="right" reserve="90pt"><value><text>${says}</text></value></caption>`;
const text = (name: string, y: number, says: string) =>
	`<field ${name} x="20pt" y="${y}pt" w="200pt" h="20pt"><ui><textEdit/></ui>${caption(says)}</field>`;
const tick = (name: string, y: number, says: string) =>
	`<field name="${name}" x="20pt" y="${y}pt" w="200pt" h="20pt"><ui><checkButton shape="square" size="10pt"/></ui>${caption(says)}<items><integer>1</integer><integer>0</integer></items></field>`;
const choice = (name: string, y: number, says: string) =>
	`<field name="${name}" x="20pt" y="${y}pt" w="200pt" h="20pt"><ui><choiceList open="onEntry"/></ui>${caption(says)}<items><text>one</text><text>two</text></items></field>`;
const radio = (name: string, y: number) =>
	`<field name="${name}" y="${y}pt" w="200pt" h="20pt"><ui><checkButton shape="round" size="10pt"/></ui>${caption(name)}<items><text>1</text></items></field>`;
const under = (name: string, y: number, inner: string) =>
	`<subform name="${name}" x="0pt" y="${y}pt" w="400pt" h="30pt">${inner}</subform>`;

/** Each field `sanitize` reads from a dynamic form whose page holds `body`, with the caption that tells it apart. */
async function fields(body: string) {
	const read = await sanitize(await dynamicForm(body));
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	return read.form.fields.map((field) => ({
		id: field.id,
		kind: field.kind,
		tooltip: field.tooltip,
		...(field.kind === 'radio' ? { group: field.group, on: field.on } : {}),
		...(field.kind === 'choice' ? { options: field.options } : {})
	}));
}

it('converts a dynamic form with a field named as the subform beside it, whichever comes first', async () => {
	const body =
		text('name="Row1"', 20, 'the field Row1') +
		under('Row1', 60, text('name="a"', 0, 'a of Row1')) +
		under('Row2', 100, text('name="a"', 0, 'a of Row2')) +
		text('name="Row2"', 140, 'the field Row2');

	expect(await fields(body)).toEqual([
		{ id: 'p1.Page1.form1.Row1', kind: 'text', tooltip: 'the field Row1' },
		{ id: 'p1.Page1.form1.Row1.a', kind: 'text', tooltip: 'a of Row1' },
		{ id: 'p1.Page1.form1.Row2.a', kind: 'text', tooltip: 'a of Row2' },
		{ id: 'p1.Page1.form1.Row2', kind: 'text', tooltip: 'the field Row2' }
	]);
}, 120_000);

it('converts a dynamic form with a check box and a choice each named as the subform beside it', async () => {
	const body =
		tick('Row1', 20, 'the box Row1') +
		under('Row1', 60, text('name="a"', 0, 'a of Row1')) +
		under('Row2', 100, text('name="a"', 0, 'a of Row2')) +
		choice('Row2', 140, 'the choice Row2');

	expect(await fields(body)).toEqual([
		{ id: 'p1.Page1.form1.Row1', kind: 'checkbox', tooltip: 'the box Row1' },
		{ id: 'p1.Page1.form1.Row1.a', kind: 'text', tooltip: 'a of Row1' },
		{ id: 'p1.Page1.form1.Row2.a', kind: 'text', tooltip: 'a of Row2' },
		{
			id: 'p1.Page1.form1.Row2',
			kind: 'choice',
			tooltip: 'the choice Row2',
			options: ['one', 'two']
		}
	]);
}, 120_000);

it('converts a dynamic form with a field whose name ends in a period', async () => {
	const body = text('name="Equipment."', 20, 'ends in a period') + text('name="b"', 60, 'b');

	expect(await fields(body)).toEqual([
		{ id: 'p1.Page1.form1.Equipment.', kind: 'text', tooltip: 'ends in a period' },
		{ id: 'p1.Page1.form1.b', kind: 'text', tooltip: 'b' }
	]);
}, 120_000);

it('converts a dynamic form with a field of no name, which is called what its subform is', async () => {
	const body = text('', 20, 'has no name') + text('name="b"', 60, 'b');

	expect(await fields(body)).toEqual([
		{ id: 'p1.Page1.form1', kind: 'text', tooltip: 'has no name' },
		{ id: 'p1.Page1.form1.b', kind: 'text', tooltip: 'b' }
	]);
}, 120_000);

it('converts a dynamic form with an exclusion group named as the subform beside it', async () => {
	const body =
		under('pick', 20, text('name="a"', 0, 'a of pick')) +
		`<exclGroup name="pick" x="20pt" y="60pt">${radio('yes', 0)}${radio('no', 30)}</exclGroup>`;

	expect(await fields(body)).toEqual([
		{ id: 'p1.Page1.form1.pick.a', kind: 'text', tooltip: 'a of pick' },
		{
			id: 'p1.Page1.form1.pick',
			kind: 'radio',
			tooltip: 'yes',
			group: 'p1.Page1.form1.pick',
			on: 'yes'
		},
		{
			id: 'p1.Page1.form1.pick#2',
			kind: 'radio',
			tooltip: 'no',
			group: 'p1.Page1.form1.pick',
			on: 'no'
		}
	]);
}, 120_000);
