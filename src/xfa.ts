import {
	PDFAcroCheckBox,
	PDFAcroComboBox,
	PDFAcroRadioButton,
	PDFAcroText,
	PDFCheckBox,
	PDFDocument,
	PDFDropdown,
	PDFFont,
	PDFField,
	PDFHexString,
	PDFName,
	PDFOperator,
	PDFOperatorNames,
	PDFPage,
	PDFRadioGroup,
	PDFTextField,
	StandardFonts,
	rgb
} from 'pdf-lib';
import type { PDFAcroField, PDFRef } from 'pdf-lib';
import { displayList, type DisplayList, type Run } from './display-list.js';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_PAGES } from './types.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets, type XfaWidget } from './xfa-widgets.js';

/**
 * A dynamic Adobe LiveCycle form as an ordinary static AcroForm, or the input
 * unchanged when it is not one.
 *
 * In a dynamic form the fields exist only as XML inside `/AcroForm /XFA`:
 * `/Fields` is empty, and the one page in the file is a placeholder, most often
 * a "Please wait" notice. Converting one takes an XFA layout engine, and pdf.js
 * has one. This runs it, reads the geometry the browser solved off the DOM, and
 * writes both the printed page and the fields back out as a PDF the later
 * stages already take.
 *
 * It is a normalization: bytes in, bytes out, and every later stage reads the
 * result as it reads a static form.
 */
export async function xfaToAcroForm(bytes: Uint8Array): Promise<Uint8Array> {
	const stage = new XfaStage();
	let opened: Awaited<ReturnType<typeof openPdf>> | undefined;
	try {
		// pdf.js adds the faces a form embeds to this document's font set.
		opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready });
		const { pdf } = opened;
		if (!pdf.isPureXfa) return bytes;
		// pdf.js counts a dynamic form's pages as it opens the file.
		if (pdf.numPages > MAX_PAGES)
			throw new Refused({ code: 'too_many_pages', pages: pdf.numPages, limit: MAX_PAGES });
		const out = await PDFDocument.create();
		const fonts = new Map<StandardFonts, PDFFont>();
		const widgets: XfaWidget[] = [];

		for (let number = 1; number <= pdf.numPages; number++) {
			const laid = await stage.lay(await pdf.getPage(number));
			const list = displayList(laid, number);
			for (const widget of harvestWidgets(laid, number)) widgets.push(widget);
			await paint(out.addPage([list.width, list.height]), number, list, async (name) => {
				let font = fonts.get(name);
				if (!font) fonts.set(name, (font = await out.embedFont(name)));
				return font;
			});
		}

		stamp(out, widgets);
		return await out.save();
	} finally {
		stage.close();
		await opened?.close();
	}
}

/** PDF's origin is bottom-left; every primitive arrives top-left. */
function paint(
	page: PDFPage,
	pageNumber: number,
	list: DisplayList,
	font: (name: StandardFonts) => Promise<PDFFont>
): Promise<void> {
	const H = list.height;
	for (const box of list.boxes) {
		if (box.fill)
			page.drawRectangle({
				x: box.x,
				y: H - box.y - box.h,
				width: box.w,
				height: box.h,
				color: rgb(...box.fill),
				borderWidth: 0
			});
		const [top, right, bottom, left] = box.edges;
		const seg = (x1: number, y1: number, x2: number, y2: number, edge: NonNullable<typeof top>) =>
			page.drawLine({
				start: { x: x1, y: H - y1 },
				end: { x: x2, y: H - y2 },
				thickness: edge.width,
				color: rgb(...edge.colour)
			});
		if (top) seg(box.x, box.y + top.width / 2, box.x + box.w, box.y + top.width / 2, top);
		if (bottom)
			seg(
				box.x,
				box.y + box.h - bottom.width / 2,
				box.x + box.w,
				box.y + box.h - bottom.width / 2,
				bottom
			);
		if (left) seg(box.x + left.width / 2, box.y, box.x + left.width / 2, box.y + box.h, left);
		if (right)
			seg(
				box.x + box.w - right.width / 2,
				box.y,
				box.x + box.w - right.width / 2,
				box.y + box.h,
				right
			);
	}
	for (const line of list.lines)
		page.drawLine({
			start: { x: line.x1, y: H - line.y1 },
			end: { x: line.x2, y: H - line.y2 },
			thickness: line.width,
			color: rgb(...line.colour)
		});
	return drawRuns(page, pageNumber, list.runs, H, font);
}

async function drawRuns(
	page: PDFPage,
	pageNumber: number,
	runs: Run[],
	H: number,
	get: (name: StandardFonts) => Promise<PDFFont>
): Promise<void> {
	for (const run of runs) {
		const font = await get(standard14(run));
		// The standard-14 fonts encode WinAnsi alone. Dropping the run would lose a
		// line of the form without anything reporting it.
		const encodable = font.getCharacterSet();
		if ([...run.text].some((char) => !encodable.includes(char.codePointAt(0)!)))
			throw new Refused({
				code: 'unpaintable',
				page: pageNumber - 1,
				construct: 'glyph',
				detail: run.text.slice(0, 40)
			});
		// The standard-14 substitute's advances differ from the embedded face's.
		// Letter spacing goes in first, since it is a real property of the run;
		// horizontal scaling then pins the whole run to the width the browser
		// measured, so the error stays inside the run instead of drifting across
		// the line.
		const natural = font.widthOfTextAtSize(run.text, run.size);
		const spaced = natural + run.letterSpacing * Math.max(0, run.text.length - 1);
		const scale =
			spaced > 0 && run.width > 0 ? Math.max(50, Math.min(200, (100 * run.width) / spaced)) : 100;
		const scaled = Math.abs(scale - 100) > 3;
		// Both are text-state parameters, so they persist across drawText's own
		// BT/ET and have to be put back.
		if (run.letterSpacing)
			page.pushOperators(
				PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, [
					String(+run.letterSpacing.toFixed(4))
				])
			);
		if (scaled)
			page.pushOperators(
				PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [String(+scale.toFixed(3))])
			);
		page.drawText(run.text, {
			x: run.x,
			y: H - run.baseline,
			size: run.size,
			font,
			color: rgb(...run.colour)
		});
		if (scaled)
			page.pushOperators(PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, ['100']));
		if (run.letterSpacing)
			page.pushOperators(PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, ['0']));
	}
}

function standard14(run: Run): StandardFonts {
	const family = run.family.toLowerCase();
	if (family.includes('courier') || family.includes('mono'))
		return run.bold && run.italic
			? StandardFonts.CourierBoldOblique
			: run.bold
				? StandardFonts.CourierBold
				: run.italic
					? StandardFonts.CourierOblique
					: StandardFonts.Courier;
	if (family.includes('times') || (family.includes('serif') && !family.includes('sans')))
		return run.bold && run.italic
			? StandardFonts.TimesRomanBoldItalic
			: run.bold
				? StandardFonts.TimesRomanBold
				: run.italic
					? StandardFonts.TimesRomanItalic
					: StandardFonts.TimesRoman;
	return run.bold && run.italic
		? StandardFonts.HelveticaBoldOblique
		: run.bold
			? StandardFonts.HelveticaBold
			: run.italic
				? StandardFonts.HelveticaOblique
				: StandardFonts.Helvetica;
}

/**
 * The fields, as the shapes the inventory already understands. Radios become a
 * real AcroForm radio group, so the inventory reads each option's group and
 * on-state as it reads a static form's.
 *
 * For a text field, a checkbox and a dropdown pdf-lib asks whether
 * `backgroundColor` and `borderColor` are `in` the options, and defaults a
 * missing background to white and a missing border to black, so both are
 * passed as undefined. Left out, each paints a white box with a black border
 * over the page. A radio option takes those defaults whatever is passed, with
 * a border of no width.
 *
 * The fields are flat, each made from pdf-lib's own field class with its whole
 * name as its `/T`. pdf-lib's form would read a period in the name as a level
 * of its field tree, and holds no name as both a field and the parent of one,
 * which a field named as the subform beside it asks for. pdf.js joins the `/T`
 * of a field's ancestors with periods, so the inventory reads the whole name.
 */
function stamp(doc: PDFDocument, widgets: XfaWidget[]): void {
	const { acroForm } = doc.getForm();
	const pages = doc.getPages();
	const chrome = { borderWidth: 0, backgroundColor: undefined, borderColor: undefined };
	const groups = new Map<string, PDFRadioGroup>();
	const states = new Map<string, Set<string>>();
	const rooted = <Acro extends PDFAcroField, Made>(
		acro: Acro,
		name: string,
		of: (acro: Acro, ref: PDFRef, doc: PDFDocument) => Made
	): Made => {
		acro.setPartialName(name);
		acroForm.addField(acro.ref);
		return of(acro, acro.ref, doc);
	};

	for (const widget of widgets) {
		const page = pages[widget.page];
		const box = {
			x: widget.x,
			y: page.getHeight() - widget.y - widget.h,
			width: widget.w,
			height: widget.h,
			...chrome
		};
		if (widget.kind === 'radio' && widget.group) {
			let group = groups.get(widget.group);
			if (!group) {
				group = rooted(PDFAcroRadioButton.create(doc.context), widget.group, PDFRadioGroup.of);
				groups.set(widget.group, group);
				states.set(widget.group, new Set());
			}
			// Two members of one group cannot share an on-state, or picking either
			// picks both.
			const used = states.get(widget.group)!;
			let on = widget.on || 'option';
			for (let n = 2; used.has(on); n++) on = `${widget.on || 'option'}${n}`;
			used.add(on);
			group.addOptionToPage(on, page, box);
			tooltip(group, widget.tooltip);
			continue;
		}
		if (widget.kind === 'checkbox') {
			const tick = rooted(PDFAcroCheckBox.create(doc.context), widget.name, PDFCheckBox.of);
			tick.addToPage(page, box);
			tooltip(tick, widget.tooltip);
			continue;
		}
		if (widget.kind === 'choice') {
			const dropdown = rooted(PDFAcroComboBox.create(doc.context), widget.name, PDFDropdown.of);
			dropdown.addOptions(widget.options.length ? widget.options : ['']);
			dropdown.addToPage(page, box);
			tooltip(dropdown, widget.tooltip);
			continue;
		}
		const field = rooted(PDFAcroText.create(doc.context), widget.name, PDFTextField.of);
		if (widget.kind === 'multiline') field.enableMultiline();
		field.addToPage(page, box);
		tooltip(field, widget.tooltip);
	}
}

/** `/TU`, which the inventory reads as the widget's tooltip. */
function tooltip(field: PDFField, text?: string): void {
	if (!text) return;
	// Written on the widget just added. `addToPage` and `addOptionToPage` push
	// into `/Kids`, so writing to every kid would give each option of a radio
	// group the last option's caption.
	const widget = field.acroField.getWidgets().at(-1);
	widget?.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));
}
