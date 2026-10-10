import { describe, expect, it } from 'vitest';
import { check, suggest } from './naming.js';
import type { Field, FieldNaming, Naming } from './api.js';

const places: Field['places'] = [{ page: 0, rect: { x: 72, y: 72, w: 216, h: 18 } }];
const plain = { places, required: false, readOnly: false };

const text = (id: string, tooltip?: string): Field => ({
	...plain,
	id,
	tooltip,
	kind: 'text',
	multiline: false
});
const kept = (id: string, name: string): FieldNaming => ({ id, keep: true, name, description: '' });
const dropped = (id: string, name: string): FieldNaming => ({ ...kept(id, name), keep: false });
const naming = (...fields: FieldNaming[]): Naming => ({
	name: 'x',
	description: 'A form.',
	fields
});

describe('check', () => {
	const a = text('a');
	const box: Field = { ...plain, id: 'b', kind: 'checkbox' };
	const NOT_SNAKE_CASE = ['', 'A', 'a-b', 'a b', '1a', 'a.b', '_a', 'é'];

	it.each(NOT_SNAKE_CASE)('reports %j as the quill name', (name) => {
		expect(check([a], { ...naming(kept('a', 'first')), name })).toEqual([{ code: 'quill_name' }]);
	});

	it.each(['', ' \t\n', '\u0085'])('reports %j as the quill description', (description) => {
		expect(check([a], { ...naming(kept('a', 'first')), description })).toEqual([
			{ code: 'quill_description' }
		]);
	});

	it('takes a byte-order mark as a description, as the engine does', () => {
		expect(check([a], { ...naming(kept('a', 'first')), description: '\ufeff' })).toEqual([]);
	});

	it('reports an entry for no field once, whatever its name, and it keeps nothing', () => {
		expect(
			check([a], naming(dropped('a', 'first'), kept('z', 'Not A Name'), kept('z', 'first')))
		).toEqual([
			{ code: 'unknown_field', id: 'z' },
			{ code: 'repeated_field', id: 'z' },
			{ code: 'nothing_kept' }
		]);
	});

	it('reports an id that two entries name', () => {
		expect(check([a], naming(kept('a', 'first'), kept('a', 'second')))).toEqual([
			{ code: 'repeated_field', id: 'a' }
		]);
	});

	it('reports a field that no entry names, which leaves nothing kept', () => {
		expect(check([a], naming())).toEqual([
			{ code: 'unnamed_field', id: 'a' },
			{ code: 'nothing_kept' }
		]);
	});

	it('reports a naming that drops every field', () => {
		expect(check([a], naming(dropped('a', 'first')))).toEqual([{ code: 'nothing_kept' }]);
	});

	it('counts a read-only field as dropped, whatever its entry says', () => {
		const total: Field = { ...text('total'), readOnly: true };
		expect(check([total], naming(kept('total', 'Not A Name')))).toEqual([{ code: 'nothing_kept' }]);
	});

	it('reports a kept entry whose name is not snake_case', () => {
		expect(check([a], naming(kept('a', 'First')))).toEqual([{ code: 'field_name', id: 'a' }]);
	});

	it('reports a name that kept entries share once, however many share it', () => {
		const fields = [a, text('b'), text('c')];
		const entries = [kept('a', 'same'), kept('b', 'same'), kept('c', 'same')];
		expect(check(fields, naming(...entries))).toEqual([{ code: 'duplicate_name', name: 'same' }]);
	});

	it('reports text set on a field that is not text, even a dropped one', () => {
		const radio: Field = { ...plain, id: 'c', kind: 'radio', group: 'c' };
		const entries: FieldNaming[] = [
			{ ...kept('a', 'first'), text: 'lines' },
			{ ...dropped('b', 'second'), text: 'lines' },
			{ ...kept('c', 'third'), text: 'line' }
		];
		expect(check([a, box, radio], naming(...entries))).toEqual([
			{ code: 'text_on_non_text', id: 'b' },
			{ code: 'text_on_non_text', id: 'c' }
		]);
	});

	it.each(['a__b', 'a_'])('takes %j as the quill name and as the name of a kept entry', (name) => {
		expect(check([a], { ...naming(kept('a', name)), name })).toEqual([]);
	});

	it('holds a dropped entry to no rule about names', () => {
		const fields = [a, text('b'), text('c')];
		const entries = [kept('a', 'first'), dropped('b', 'first'), dropped('c', 'Not A Name')];
		expect(check(fields, naming(...entries))).toEqual([]);
	});

	it('returns every problem at once, in the order of the rules', () => {
		const problems = check([a, box, text('c')], {
			name: '',
			description: '',
			fields: [
				kept('a', 'first'),
				kept('a', 'first'),
				{ ...kept('b', 'Second'), text: 'line' },
				kept('d', 'fourth')
			]
		});
		expect(problems).toEqual([
			{ code: 'quill_name' },
			{ code: 'quill_description' },
			{ code: 'unknown_field', id: 'd' },
			{ code: 'repeated_field', id: 'a' },
			{ code: 'unnamed_field', id: 'c' },
			{ code: 'field_name', id: 'b' },
			{ code: 'duplicate_name', name: 'first' },
			{ code: 'text_on_non_text', id: 'b' }
		]);
	});
});

describe('suggest', () => {
	const leave = 'form1[0].page1[0].leaveType[0]';
	const fields: Field[] = [
		text('form1[0].page1[0].Header[0].dateReq[0]'),
		text('sponsor', "Sponsor's name (Last, First, Middle Initial)"),
		text('signed', 'Enter the date on which the member signs this form.'),
		text('waived', 'Enter the date on which the member signs the waiver.'),
		text('member', 'Date signed'),
		text('witness', 'Date signed'),
		text('3aRemarks'),
		text('form1[0].page1[0].'),
		{ ...text('total', 'Total cost'), readOnly: true },
		{ ...plain, id: leave, kind: 'radio', group: leave, on: 'annual' },
		{ ...plain, id: `${leave}#2`, kind: 'radio', group: leave },
		{ ...plain, id: `${leave}#3`, tooltip: 'Other (explain)', kind: 'radio', group: leave },
		text('statementofunderstandingandacknowledgementofterms'),
		text('q2Name'),
		text('grade', '(optional) Pay grade'),
		text('unitName', ' - '),
		text(`1${'a'.repeat(49)}`)
	];

	it('gives an entry per field, described by its tooltip and kept unless read-only', () => {
		expect(suggest([text('a'), { ...text('b', 'Total cost.'), readOnly: true }])).toEqual([
			{ id: 'a', keep: true, name: 'a', description: '' },
			{ id: 'b', keep: false, name: 'total_cost', description: 'Total cost.' }
		]);
	});

	it.each([
		['a line feed', 'Organizational element\n(Indicate division)'],
		['a carriage return', 'Organizational element\r(Indicate division)'],
		['both, a tab, and a space at each end', ' Organizational element \r\n\t(Indicate division) ']
	])('describes a field whose tooltip holds %s in one line', (_, tooltip) => {
		expect(suggest([text('a', tooltip)])[0].description).toBe(
			'Organizational element (Indicate division)'
		);
	});

	it('names a field from its tooltip, or from the end of its id when the tooltip has no word', () => {
		expect(suggest(fields).map((entry) => entry.name)).toEqual([
			'date_req',
			'sponsor_s_name_last_first_middle_initial',
			'enter_the_date_on_which_the_member_signs',
			'enter_the_date_on_which_the_member_signs_2',
			'date_signed',
			'date_signed_2',
			'field_3a_remarks',
			'field',
			'total_cost',
			'leave_type_annual',
			'leave_type',
			'other_explain',
			'statementofunderstandingandacknowledgeme',
			'q2_name',
			'optional_pay_grade',
			'unit_name',
			`field_1${'a'.repeat(33)}`
		]);
	});

	it('suggests a naming in which check finds no problem', () => {
		expect(check(fields, naming(...suggest(fields)))).toEqual([]);
	});

	it('does so for ids and tooltips of any shape, with every name its own', () => {
		// A fixed sequence, so a failure reproduces.
		let seed = 1;
		const below = (n: number) =>
			Math.floor(((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
		const SCRAPS = [
			...['', ' ', '-', '1', 'A', 'dateReq', 'Date Signed', '(optional)', 'é', '😀', '_', '[0]'],
			...['form1[0].', 'x'.repeat(60), '9'.repeat(45), 'date_2', 'field', 'true']
		];
		const scrap = () =>
			Array.from({ length: below(4) }, () => SCRAPS[below(SCRAPS.length)]).join(' ');

		for (let round = 0; round < 500; round++) {
			const generated = Array.from({ length: 1 + below(12) }, (_, index): Field => {
				const base = {
					...plain,
					id: `${scrap()}.${index}`,
					tooltip: below(2) ? scrap() : undefined
				};
				return below(3)
					? { ...base, kind: 'text', multiline: false }
					: { ...base, kind: 'radio', group: scrap(), on: below(2) ? scrap() : undefined };
			});
			const suggested = suggest(generated);
			const names = suggested.map((entry) => entry.name);
			expect(new Set(names).size, names.join()).toBe(names.length);
			expect(check(generated, naming(...suggested))).toEqual([]);
		}
	});
});
