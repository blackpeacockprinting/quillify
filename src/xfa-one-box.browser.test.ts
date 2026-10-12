import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

const text = (name: string, x: number, y: number) =>
	`<field name="${name}" x="${x}pt" y="${y}pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>`;

const choice = (name: string, y: number, item: string) =>
	`<field name="${name}" x="72pt" y="${y}pt" w="200pt" h="20pt"><ui><choiceList/></ui><items><text>${item}</text></items></field>`;

/** The id, kind and rect of each field `sanitize` reads from a one-page dynamic form. */
async function fields(body: string) {
	const read = await sanitize(await dynamicForm(body));
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	return read.form.fields.map(({ id, kind, places }) => ({ id, kind, rect: places[0].rect }));
}

it('reads a field its template holds twice at one place as one field', async () => {
	expect(
		await fields(text('twice', 72, 120) + text('beside', 72, 160) + text('twice', 72, 120))
	).toEqual([
		{ id: 'p1.Page1.form1.twice', kind: 'text', rect: { x: 72, y: 120, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.beside', kind: 'text', rect: { x: 72, y: 160, w: 200, h: 20 } }
	]);
}, 120_000);

it('reads two fields where the name, the kind, the place, the tooltip or the options differ', async () => {
	expect(
		await fields(
			text('moved', 72, 120) +
				text('moved', 72, 160) +
				text('named', 72, 200) +
				text('other', 72, 200) +
				text('kind', 72, 240) +
				choice('kind', 240, 'A') +
				text('tip', 72, 280) +
				'<field name="tip" x="72pt" y="280pt" w="200pt" h="20pt"><ui><textEdit/></ui><assist><toolTip>Sample</toolTip></assist></field>' +
				choice('items', 320, 'A') +
				choice('items', 320, 'B')
		)
	).toEqual([
		{ id: 'p1.Page1.form1.moved', kind: 'text', rect: { x: 72, y: 120, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.moved#2', kind: 'text', rect: { x: 72, y: 160, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.named', kind: 'text', rect: { x: 72, y: 200, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.other', kind: 'text', rect: { x: 72, y: 200, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.kind', kind: 'text', rect: { x: 72, y: 240, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.kind#2', kind: 'choice', rect: { x: 72, y: 240, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.tip', kind: 'text', rect: { x: 72, y: 280, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.tip#2', kind: 'text', rect: { x: 72, y: 280, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.items', kind: 'choice', rect: { x: 72, y: 320, w: 200, h: 20 } },
		{ id: 'p1.Page1.form1.items#2', kind: 'choice', rect: { x: 72, y: 320, w: 200, h: 20 } }
	]);
}, 120_000);
