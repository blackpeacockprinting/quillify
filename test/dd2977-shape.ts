import { PDFDocument, rgb } from 'pdf-lib';

/**
 * A form in the shape of the fork's copy of DD 2977, which is not carried: a
 * plain AcroForm on three Letter pages, one content stream each. Of its 50
 * widget annotations 33 are on page one, 17 on page two and none on page
 * three: 3 push buttons with a label inside, 6 checkboxes, 2 dropdowns and 39
 * text boxes, 30 of them multiline. What is printed is an outline around each
 * box.
 */
export async function dd2977Shape(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const pages = [0, 1, 2].map(() => doc.addPage([612, 792]));
	const form = doc.getForm();
	let placed = 0;
	const next = () => {
		const page = pages[Math.floor(placed / 33)];
		const slot = placed++ % 33;
		const box = {
			x: 24 + (slot % 3) * 190,
			y: 720 - Math.floor(slot / 3) * 64,
			width: 180,
			height: 40
		};
		page.drawRectangle({ ...box, borderColor: rgb(0, 0, 0), borderWidth: 1 });
		return [page, box] as const;
	};

	for (const [i, label] of ['9. RESIDUAL RISK LEVEL', '+', '-'].entries())
		form.createButton(`button_${i}`).addToPage(label, ...next());
	for (let i = 0; i < 6; i++) form.createCheckBox(`check_${i}`).addToPage(...next());
	for (let i = 0; i < 2; i++) {
		const level = form.createDropdown(`level_${i}`);
		level.addOptions(['EH', 'H', 'M', 'L']);
		level.addToPage(...next());
	}
	for (let i = 0; i < 39; i++) {
		const text = form.createTextField(`text_${i}`);
		if (i >= 9) text.enableMultiline();
		text.addToPage(...next());
	}
	pages[2].drawText('Instructions', { x: 24, y: 740 });
	return doc.save();
}
