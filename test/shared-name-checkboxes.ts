import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

/**
 * A one-page form of three fields, each with several checkboxes. The boxes of
 * `attached` turn on as `is` and as `is_not`, so the file lets one of them be
 * ticked. The boxes of `copy` both turn on as `Yes`: one box painted twice. The
 * boxes of `twice` turn on as `one`, as `two` and as `one` again.
 */
export async function sharedNameCheckboxes(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const form = doc.getForm();

	const boxes = (name: string, top: number, states: string[]) => {
		const field = form.createCheckBox(name);
		for (const index of states.keys())
			field.addToPage(page, { x: 72, y: top - 20 * index, width: 12, height: 12, borderWidth: 0 });
		for (const [index, on] of states.entries()) {
			const { dict } = field.acroField.getWidgets()[index];
			const normal = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFDict);
			const drawn = normal.get(PDFName.of('Yes'))!;
			normal.delete(PDFName.of('Yes'));
			normal.set(PDFName.of(on), drawn);
		}
	};
	boxes('attached', 700, ['is', 'is_not']);
	boxes('copy', 640, ['Yes', 'Yes']);
	boxes('twice', 580, ['one', 'two', 'one']);

	return doc.save({ updateFieldAppearances: false });
}
