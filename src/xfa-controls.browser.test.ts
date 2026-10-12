import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';
import { openPdf } from './pdfjs.js';

/** A one-page dynamic form with a captioned field of the control `ui`, and a text field under it. */
const probed = (ui: string) =>
	dynamicForm(
		`<field name="probed" x="72pt" y="120pt" w="200pt" h="20pt">${ui}<caption placement="left" reserve="60pt"><value><text>Probed</text></value></caption></field>` +
			'<field name="beside" x="72pt" y="160pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>'
	);

const BESIDE = {
	id: 'p1.Page1.form1.beside',
	kind: 'text',
	rect: { x: 72, y: 160, w: 200, h: 20 }
};

/** The fields `sanitize` reads from a form, and whether its redrawn page prints the caption. */
async function converted(pdf: Uint8Array) {
	const read = await sanitize(pdf);
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	const { pdf: page, close } = await openPdf(read.form.pdf);
	try {
		const { items } = await (await page.getPage(1)).getTextContent();
		return {
			caption: items.some((item) => 'str' in item && item.str.includes('Probed')),
			fields: read.form.fields.map(({ id, kind, places }) => ({ id, kind, rect: places[0].rect }))
		};
	} finally {
		await close();
	}
}

it.each([
	['an empty ui', '<ui/>'],
	['a ui that holds only extras', '<ui><extras/></ui>'],
	['a ui that holds only a picture', '<ui><picture>9</picture></ui>'],
	['a defaultUi', '<ui><defaultUi/></ui>']
])(
	'reads a field with %s as a text field, with its caption printed',
	async (_, ui) => {
		expect(await converted(await probed(ui))).toEqual({
			caption: true,
			fields: [
				{ id: 'p1.Page1.form1.probed', kind: 'text', rect: { x: 132, y: 120, w: 140, h: 20 } },
				BESIDE
			]
		});
	},
	120_000
);

it('reads an empty ui with one list of items as a check box, and with two as a choice', async () => {
	const read = await converted(
		await dynamicForm(
			'<field name="one" x="72pt" y="120pt" w="200pt" h="20pt"><ui/><items><integer>1</integer></items></field>' +
				'<field name="two" x="72pt" y="160pt" w="200pt" h="20pt"><ui/><items><text>A</text><text>B</text></items><items save="1"><text>a</text><text>b</text></items></field>'
		)
	);
	expect(read.fields).toEqual([
		{ id: 'p1.Page1.form1.one', kind: 'checkbox', rect: { x: 72, y: 125, w: 10, h: 10 } },
		{ id: 'p1.Page1.form1.two', kind: 'choice', rect: { x: 72, y: 160, w: 200, h: 20 } }
	]);
}, 120_000);

it('prints the caption of an image field and reads no field for it', async () => {
	expect(await converted(await probed('<ui><imageEdit/></ui>'))).toEqual({
		caption: true,
		fields: [BESIDE]
	});
}, 120_000);

it.each([
	['a barcode', '<ui><barcode type="code39"/></ui>', 'barcode'],
	['a password field', '<ui><passwordEdit/></ui>', 'password']
])(
	'refuses a page with %s, and names it',
	async (_, ui, construct) => {
		expect(await sanitize(await probed(ui))).toEqual({
			ok: false,
			refusal: { code: 'unpaintable', page: 0, construct }
		});
	},
	120_000
);
