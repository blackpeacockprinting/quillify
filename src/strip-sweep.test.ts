import { PDFDocument, PDFName } from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';

it("keeps what a page reaches only through a stream's own dictionary", async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const { context } = doc;
	const image = { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8 };
	const font = context.register(
		context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Courier' })
	);
	const mask = context.register(context.stream('MASK', { ...image, ColorSpace: 'DeviceGray' }));
	page.node.set(
		PDFName.of('Resources'),
		context.obj({
			XObject: {
				Drawn: context.register(
					context.stream('BT /F1 12 Tf (Drawn inside) Tj ET', {
						Type: 'XObject',
						Subtype: 'Form',
						BBox: [0, 0, 612, 792],
						Resources: { Font: { F1: font } }
					})
				),
				Masked: context.register(
					context.stream('IMAGE', { ...image, ColorSpace: 'DeviceGray', SMask: mask })
				)
			}
		})
	);
	page.node.set(PDFName.of('Contents'), context.register(context.stream('/Drawn Do /Masked Do')));

	const source = await doc.save({ useObjectStreams: false });
	const background = await stripAcroForm(source, await viewsOf(source, [[0, 0, 612, 792]]));
	const text = new TextDecoder('latin1').decode(background);
	expect(text).toContain('/Courier');
	expect(text).toContain('MASK');
});
