import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from 'pdf-lib';

/**
 * What a background's catalog keeps: its pages, and the layers, tags and
 * language reading them takes.
 */
const KEPT = new Set(
	['Type', 'Pages', 'OCProperties', 'StructTreeRoot', 'MarkInfo', 'Lang'].map((key) =>
		PDFName.of(key)
	)
);

/**
 * The `acroform` background: the source file's pages, and of its catalog only
 * what reading them takes. Every Widget annotation is dropped; other
 * annotations (Link, Text) stay as they are. The rest of the catalog goes: the
 * form (`/AcroForm` with its XFA packet, `/NeedsRendering`), the file's
 * metadata (`/Info`, XMP), its scripts, attachments, portfolio and bookmarks,
 * and the usage-rights signature under `/Perms`. The signature goes here and
 * not through qpdf's `--remove-restrictions`, which also strips `/FT /Sig` from
 * every signature field.
 * Each page's MediaBox is set to its visible box so the engine's page frame is
 * the one the inventory measured widgets in.
 *
 * Unlinking is not enough. A saved file carries every object the context holds,
 * reachable or not, so what the catalog no longer reaches is swept. The
 * structure tree stays and still points at the form's widgets, on a page or
 * not, so every widget dictionary is deleted outright, and the fields and
 * appearance streams that hung off them go in the sweep: a background that
 * still carries them is a form layer the renderer would stamp a second one over.
 */
export async function stripAcroForm(bytes: Uint8Array): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const isWidget = (object: unknown) =>
		object instanceof PDFDict && object.get(PDFName.of('Subtype')) === PDFName.of('Widget');

	for (const page of doc.getPages()) {
		const annots = page.node.Annots();
		if (annots) {
			const kept = annots.asArray().filter((entry) => !isWidget(doc.context.lookup(entry)));
			if (kept.length === 0) page.node.delete(PDFName.of('Annots'));
			else page.node.set(PDFName.of('Annots'), doc.context.obj(kept));
		}
		const crop = page.getCropBox();
		page.setMediaBox(crop.x, crop.y, crop.width, crop.height);
		page.node.delete(PDFName.of('CropBox'));
	}
	for (const [ref, object] of doc.context.enumerateIndirectObjects())
		if (isWidget(object)) doc.context.delete(ref);

	for (const key of doc.catalog.keys()) if (!KEPT.has(key)) doc.catalog.delete(key);
	doc.context.trailerInfo.Info = undefined;

	// What the catalog no longer reaches: the objects unlinked above, and the
	// fonts only the form's default resources named.
	const reached = new Set<PDFRef>();
	const pending: unknown[] = [doc.context.trailerInfo.Root];
	while (pending.length > 0) {
		const value = pending.pop();
		if (value instanceof PDFRef) {
			if (reached.has(value)) continue;
			reached.add(value);
			pending.push(doc.context.lookup(value));
		} else if (value instanceof PDFArray) pending.push(...value.asArray());
		else if (value instanceof PDFDict) pending.push(...value.values());
		else if (value instanceof PDFStream) pending.push(...value.dict.values());
	}
	for (const [ref] of doc.context.enumerateIndirectObjects())
		if (!reached.has(ref)) doc.context.delete(ref);
	return doc.save({ useObjectStreams: false });
}
