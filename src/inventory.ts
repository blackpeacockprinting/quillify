import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { toTopLeftRect } from './coords.js';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_PAGES, MAX_WIDGETS, WIDGET_KINDS } from './types.js';
import type { FieldInventory, InventoryWidget, WidgetKind } from './types.js';

interface Annotation {
	subtype: string;
	hidden?: boolean;
	fieldName?: string;
	fieldType?: string | null;
	rect: [number, number, number, number];
	multiLine?: boolean;
	radioButton?: boolean;
	checkBox?: boolean;
	pushButton?: boolean;
	combo?: boolean;
	options?: { exportValue: string | string[] | null }[];
	readOnly?: boolean;
	required?: boolean;
	alternativeText?: string;
	maxLen?: number;
	buttonValue?: string | null;
}

/** pdf.js passes on whatever name a file gives `/FT`. */
const isWidgetKind = (type: unknown): type is WidgetKind =>
	WIDGET_KINDS.includes(type as WidgetKind);

export async function inventoryPdf(bytes: Uint8Array): Promise<FieldInventory> {
	const { pdf, close } = await openPdf(bytes);
	try {
		// XFA alone is not a refusal. A LiveCycle form is usually hybrid: the XFA
		// template rides along beside a complete AcroForm field tree, and pdf.js
		// never XFA-renders one of those, so the widgets below are the real ones.
		// A dynamic form has no field tree, and `xfaToAcroForm` has already given
		// it one by the time anything reaches here; what is left is a file that is
		// neither, which has nothing to read either way.
		const { info } = (await pdf.getMetadata()) as {
			info: { IsXFAPresent?: boolean; IsCollectionPresent?: boolean };
		};
		const xfa = pdf.isPureXfa || !!info.IsXFAPresent;
		// A catalog that declares a collection is a portfolio or a wrapper, and
		// its first page is a cover sheet by construction. AF 3070A is the
		// Microsoft Purview shape: the real three-page form is a 1.5 MB attachment
		// encrypted to a tenant nobody here has a licence for, and counting the
		// cover sheet's widgets answers the wrong question.
		if (info.IsCollectionPresent) {
			const [attachment] = (await pdf.getAttachments())?.keys() ?? [];
			throw new Refused({ code: 'portfolio', attachment });
		}
		if (pdf.numPages > MAX_PAGES)
			throw new Refused({ code: 'too_many_pages', pages: pdf.numPages, limit: MAX_PAGES });
		const inherited = await tooltipsByField(bytes);

		const widgets: InventoryWidget[] = [];
		const dims: FieldInventory['pages'] = [];
		const seen = new Map<string, number>();
		const byName = new Map<string, InventoryWidget>();
		for (let index = 0; index < pdf.numPages; index++) {
			const page = await pdf.getPage(index + 1);
			if (page.rotate % 360 !== 0) throw new Refused({ code: 'rotated', page: index });
			const view = page.view as [number, number, number, number];
			dims.push({ width: view[2] - view[0], height: view[3] - view[1] });

			const annotations = (await page.getAnnotations()) as Annotation[];
			for (const a of annotations) {
				// A push button runs an action; it holds no value, so it is no field.
				if (a.subtype !== 'Widget' || a.hidden || !isWidgetKind(a.fieldType) || a.pushButton)
					continue;
				const name = a.fieldName ?? '';
				const place = { page: index, rect: toTopLeftRect(a.rect, view, page.rotate) };
				// One name is one value in the file: typing into any widget that
				// carries it fills every other. SF 1152 ships an original and a file
				// copy sharing one field tree, so half its 60 annotations are the
				// other half painted again. A radio option is the exception, since
				// its on-state is the whole point of being separate.
				const shared = a.radioButton || !name ? undefined : byName.get(name);
				if (shared) {
					shared.places.push(place);
					continue;
				}
				const count = (seen.get(name) ?? 0) + 1;
				seen.set(name, count);
				const widget: InventoryWidget = {
					id: count === 1 ? name : `${name}#${count}`,
					name,
					kind: a.fieldType,
					places: [place],
					multiLine: a.multiLine ?? false,
					checkBox: a.checkBox ?? false,
					radioButton: a.radioButton ?? false,
					combo: a.combo ?? false,
					options: (a.options ?? [])
						.map((o) => o.exportValue)
						.filter((value) => typeof value === 'string'),
					readOnly: a.readOnly ?? false,
					required: a.required ?? false,
					tooltip: a.alternativeText || inherited.get(name) || undefined,
					maxLen: a.maxLen ?? 0,
					buttonValue: a.buttonValue ?? undefined
				};
				widgets.push(widget);
				if (!a.radioButton && name) byName.set(name, widget);
			}
		}

		// The cap reads a complete count. Inside the page loop it would name a
		// running partial.
		if (widgets.length > MAX_WIDGETS)
			throw new Refused({ code: 'too_many_fields', fields: widgets.length, limit: MAX_WIDGETS });
		if (widgets.length === 0) throw new Refused({ code: 'no_fields', xfa });
		return { pages: dims, widgets };
	} finally {
		await close();
	}
}

/**
 * Every field's `/TU` by its fully qualified name.
 *
 * Acrobat writes `/T` and `/TU` on the field and puts bare widget annotations in
 * `/Kids`. pdf.js walks `/Parent` for `/T` and inherits `/FT`, but reads `/TU`
 * straight off the annotation, so every kid of a split field arrives unlabelled:
 * 16 of EOIR-28's 53, 32 of VA 26-1880's 81, all 60 of SF 1152's. A widget's
 * tooltip is its field's tooltip, which is the same parent walk pdf.js already
 * does for the name.
 *
 * pdf-lib carries no decryption, so this only reads what `normalizePdf` has
 * already decrypted.
 */
async function tooltipsByField(bytes: Uint8Array): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	for (const field of doc.getForm().getFields()) {
		const tip = field.acroField.dict.lookup(PDFName.of('TU'));
		if (tip instanceof PDFString || tip instanceof PDFHexString)
			found.set(field.getName(), tip.decodeText());
	}
	return found;
}
