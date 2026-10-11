/**
 * Why a radio group is not modeled as one enum field. The schema would be
 * right (exactly one option holds), and the engine accepts the binding, but
 * `form@0.2.0` carries no per-widget on-state, so the stamper writes the chosen
 * value into every widget of the group. Twelve boxes, all reading `option_3`.
 *
 * The day `form.json` carries an on-value for a widget this test fails, and
 * that is the signal to change how `assemble.ts` writes a group.
 */

import { describe, expect, it } from 'vitest';
import formUrl from '../test/fixtures/DD577_Appointment_Termination_Record.pdf?url';
import { fromTree, render } from '../test/engine.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';

describe('radio group binding', () => {
	it('stamps every widget of the group, which is why we do not bind one enum', async () => {
		const bytes = await normalizePdf(new Uint8Array(await (await fetch(formUrl)).arrayBuffer()));
		const inventory = await inventoryPdf(bytes);
		const background = await stripAcroForm(bytes, inventory.views);

		const radios = inventory.widgets.filter((w) => w.radioButton);
		expect(radios.length).toBeGreaterThan(1);

		const options = radios.map((_, i) => `option_${i + 1}`);
		const yaml = [
			'quill:',
			'  name: radio_probe',
			'  version: 0.1.0',
			'  backend: acroform',
			'  description: probe',
			'',
			'main:',
			'  body:',
			'    enabled: false',
			'  fields:',
			'    choice:',
			'      type: enum',
			'      values:',
			...options.map((o) => `        - ${JSON.stringify(o)}`),
			'      default: ""',
			'      description: The one option.'
		].join('\n');
		const form = {
			schema: 'quillmark/form@0.2.0',
			fields: radios.map((w) => ({
				name: w.id,
				schema_field: 'choice',
				page: w.places[0].page,
				rect: w.places[0].rect
			})),
			widgets: []
		};
		const encoder = new TextEncoder();
		const tree = new Map<string, Uint8Array>([
			['Quill.yaml', encoder.encode(yaml + '\n')],
			['form.pdf', background],
			['form.json', encoder.encode(JSON.stringify(form, null, 2))]
		]);

		const { ref, quill } = await fromTree(tree);
		const md = `~~~\n$quill: ${ref}\n$kind: main\nchoice: ${JSON.stringify(options[2])}\n~~~\n`;
		const pdf = await render(quill, md);
		const { PDFDocument, PDFDropdown } = await import('pdf-lib');
		const out = await PDFDocument.load(pdf);
		const stamped = out.getForm().getFields();

		expect(stamped.map((f) => f.getName())).toEqual(radios.map((w) => w.id));
		expect(stamped.map((f) => f instanceof PDFDropdown && f.getSelected())).toEqual(
			radios.map(() => [options[2]])
		);
	}, 120_000);
});
