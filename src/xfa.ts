import {
	PDFDocument,
	PDFFont,
	PDFField,
	PDFHexString,
	PDFName,
	PDFOperator,
	PDFOperatorNames,
	PDFPage,
	StandardFonts,
	rgb
} from 'pdf-lib';
import { displayList, type DisplayList, type Run } from './display-list.js';
import { PdfImportRefusal } from './inventory.js';
import { openPdf } from './pdfjs.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets, type XfaWidget } from './xfa-widgets.js';

/**
 * A dynamic Adobe LiveCycle form as an ordinary static AcroForm, or the input
 * unchanged when it is not one.
 *
 * Ten of the twenty-four published federal forms in the corpus are dynamic: the
 * fields exist only as XML inside `/AcroForm /XFA`, `/Fields` is empty, and the
 * one page in the file is the "Please wait" notice. Converting one takes an XFA
 * layout engine, and pdf.js has one. This runs it, reads the geometry the browser
 * solved off the DOM, and writes both the printed page and the fields back out
 * as a PDF the rest of the pipeline already takes.
 *
 * Normalization, not a second pipeline: bytes in, bytes out, and everything
 * downstream is unchanged.
 */
export async function xfaToAcroForm(bytes: Uint8Array): Promise<Uint8Array> {
	const task = await openPdf(bytes, { enableXfa: true });
	let stage: XfaStage | undefined;
	try {
		const pdf = await task.promise;
		if (!pdf.isPureXfa) return bytes;
		stage = new XfaStage();
		const out = await PDFDocument.create();
		const fonts = new Map<StandardFonts, PDFFont>();
		const widgets: XfaWidget[] = [];

		for (let number = 1; number <= pdf.numPages; number++) {
			const laid = await stage.lay(await pdf.getPage(number));
			const list = displayList(laid, number);
			widgets.push(...harvestWidgets(laid, number));
			await paint(out.addPage([list.width, list.height]), list, async (name) => {
				let font = fonts.get(name);
				if (!font) fonts.set(name, (font = await out.embedFont(name)));
				return font;
			});
		}

		stamp(out, widgets);
		return await out.save();
	} finally {
		stage?.close();
		await task.destroy();
	}
}

/** PDF's origin is bottom-left; every primitive arrives top-left. */
function paint(
	page: PDFPage,
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
	return drawRuns(page, list.runs, H, font);
}

async function drawRuns(
	page: PDFPage,
	runs: Run[],
	H: number,
	get: (name: StandardFonts) => Promise<PDFFont>
): Promise<void> {
	for (const run of runs) {
		const font = await get(standard14(run));
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
		try {
			page.drawText(run.text, {
				x: run.x,
				y: H - run.baseline,
				size: run.size,
				font,
				color: rgb(...run.colour)
			});
		} catch {
			// pdf-lib's WinAnsi encoder throws on a character the standard-14 fonts
			// have no code for. Dropping the run would lose a line of the form
			// without anything reporting it.
			throw new PdfImportRefusal(
				`This form uses a character the importer cannot draw, in "${run.text.slice(0, 40)}". Print it to a flat PDF and import that.`
			);
		}
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
 * real AcroForm radio group rather than N booleans: `form@0.2.0` carries no
 * per-widget on-state, so N booleans would let every option of an exclusive
 * group be ticked at once and would stamp one chosen value into all of them.
 *
 * `backgroundColor` and `borderColor` are passed explicitly because pdf-lib
 * tests for the key with `in`, not for undefined, and defaults a missing one to
 * opaque white. Left out, all 831 widgets paint a white box with a black border
 * over the page, which on DD 2875 erases the UNCLASSIFIED banners.
 */
function stamp(doc: PDFDocument, widgets: XfaWidget[]): void {
	const form = doc.getForm();
	const pages = doc.getPages();
	const chrome = { borderWidth: 0, backgroundColor: undefined, borderColor: undefined };
	const groups = new Map<string, ReturnType<typeof form.createRadioGroup>>();
	const states = new Map<string, Set<string>>();

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
				groups.set(widget.group, (group = form.createRadioGroup(widget.group)));
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
			const tick = form.createCheckBox(widget.name);
			tick.addToPage(page, box);
			tooltip(tick, widget.tooltip);
			continue;
		}
		if (widget.kind === 'choice') {
			const dropdown = form.createDropdown(widget.name);
			dropdown.addOptions(widget.options.length ? widget.options : ['']);
			dropdown.addToPage(page, box);
			tooltip(dropdown, widget.tooltip);
			continue;
		}
		const field = form.createTextField(widget.name);
		if (widget.kind === 'multiline') field.enableMultiline();
		field.addToPage(page, box);
		tooltip(field, widget.tooltip);
	}
}

/**
 * `/TU`, which the inventory reads as the widget's hover text and the naming
 * pass reads as a label. It covers 740 of the corpus's 831 XFA fields; the rest
 * are named off the page raster, as an unlabelled AcroForm widget already is.
 */
function tooltip(field: PDFField, text?: string): void {
	if (!text) return;
	// On the widget just added, not the field: `addToPage` and `addOptionToPage`
	// push into `/Kids`, so writing to all of them gives every option of a radio
	// group the last option's caption.
	const widget = field.acroField.getWidgets().at(-1);
	widget?.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));
}
