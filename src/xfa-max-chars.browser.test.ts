import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

it('reads the maxChars of a dynamic form text field as its maxLength', async () => {
	const read = await sanitize(
		await dynamicForm(
			'<field name="last4" x="72pt" y="120pt" w="200pt" h="20pt"><ui><textEdit/></ui><value><text maxChars="4"/></value></field>' +
				'<field name="duties" x="72pt" y="160pt" w="400pt" h="120pt"><ui><textEdit multiLine="1"/></ui><value><text maxChars="500"/></value></field>' +
				'<field name="open" x="72pt" y="300pt" w="200pt" h="20pt"><ui><textEdit/></ui><value><text/></value></field>'
		)
	);
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	expect(
		read.form.fields.map((field) =>
			field.kind === 'text'
				? { id: field.id, multiline: field.multiline, maxLength: field.maxLength }
				: { id: field.id, kind: field.kind }
		)
	).toEqual([
		{ id: 'p1.Page1.form1.last4', multiline: false, maxLength: 4 },
		{ id: 'p1.Page1.form1.duties', multiline: true, maxLength: 500 },
		{ id: 'p1.Page1.form1.open', multiline: false, maxLength: undefined }
	]);
}, 120_000);
