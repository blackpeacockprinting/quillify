import { PDFDocument } from 'pdf-lib';
import type { View } from '../src/types.js';

/**
 * The views a test hands `stripAcroForm` for a file it holds no inventory of:
 * each page as pdf-lib reads it, framed by the box the test names for it.
 */
export async function viewsOf(bytes: Uint8Array, boxes: View['box'][]): Promise<View[]> {
	const pages = (await PDFDocument.load(bytes, { updateMetadata: false })).getPages();
	return boxes.map((box, index) => {
		const { objectNumber: num, generationNumber: gen } = pages[index].ref;
		return { ref: { num, gen }, box };
	});
}
