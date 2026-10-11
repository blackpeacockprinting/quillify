import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFPageTree,
	PDFRef,
	PDFStream,
	PDFString
} from 'pdf-lib';

const names = (keys: string): Set<unknown> =>
	new Set(keys.split(' ').map((key) => PDFName.of(key)));

/** Of its catalog a background keeps the pages, and the layers, tags and language reading them takes. */
const CATALOG = names('Type Pages OCProperties StructTreeRoot MarkInfo Lang');
/** Of a page tree node, its place in the tree and what its pages inherit. Each page has its box by then. */
const TREE = names('Type Parent Kids Count Resources Rotate');
/** Of a page, what paints it and what tags it. Its links are set apart. */
const PAGE = names(
	'Type Parent Resources MediaBox Contents Rotate Group UserUnit StructParents Tabs'
);
/** Of a link, where it sits, how it is drawn, when it shows, how it is read aloud and tagged, and where it leads. */
const LINK = names('Type Subtype Rect Border BS C H QuadPoints F OC Contents StructParent A Dest');
/** Of a link's action, its kind and where it leads. */
const TO_ADDRESS = names('S URI');
const TO_PLACE = names('S D');

const only = (dict: PDFDict, kept: Set<unknown>) => {
	for (const key of dict.keys()) if (!kept.has(key)) dict.delete(key);
};
const copy = (dict: PDFDict, kept: Set<unknown>) => {
	const cut = dict.context.obj({});
	for (const [key, value] of dict.entries()) if (kept.has(key)) cut.set(key, value);
	return cut;
};

/**
 * The `acroform` background: the source file's pages, and of the catalog, of
 * the page tree, of each page and of each link only a named set of keys. With
 * the rest of the catalog go the form (`/AcroForm` with its XFA packet,
 * `/NeedsRendering`), the XMP metadata, the scripts, attachments, portfolio and
 * bookmarks, and the usage-rights signature under `/Perms`. The signature goes
 * here because qpdf's `--remove-restrictions`, which takes it too, also strips
 * `/FT /Sig` from every signature field. The trailer's `/Info` goes too.
 *
 * Of a page's annotations a Link stays, when it leads to an http or https
 * address or to an explicit destination in the file, and leads there one way.
 * A named destination resolves through the catalog's `/Dests` or `/Names`,
 * which go, so a link to one goes too, and so does a link with an action
 * chained after its own. The action a link keeps is a copy, so nothing the file
 * hangs on the same object is cut with it.
 *
 * Each page's MediaBox is set to its crop box, which is the frame the inventory
 * measured widgets in whenever the crop box lies inside the media box.
 *
 * Unlinking is not enough. A saved file carries every object the context holds,
 * reachable or not, so what the catalog no longer reaches is swept. The
 * structure tree stays and can still name an annotation no page lists or a page
 * outside the page tree. So an object that reads as either and is not kept is
 * deleted outright, and the files, fields and appearance streams that hung off
 * it go in the sweep: a background that still carries a form layer is one the
 * renderer would stamp a second one over.
 */
export async function stripAcroForm(bytes: Uint8Array): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const { context } = doc;
	const at = (object: unknown, key: string) =>
		object instanceof PDFDict ? object.lookup(PDFName.of(key)) : undefined;
	const is = (object: unknown, key: string, name: string): object is PDFDict =>
		at(object, key) === PDFName.of(name);
	/** An annotation need not say it is one: a `/Rect` or a `/Subtype /Widget` is enough. */
	const annotation = (object: unknown) =>
		is(object, 'Type', 'Annot') ||
		at(object, 'Rect') !== undefined ||
		is(object, 'Subtype', 'Widget');

	/** The action a link that stays keeps, `null` when it holds its destination itself, `false` when it goes. */
	const leads = (link: PDFDict) => {
		if (!link.has(PDFName.of('A'))) return at(link, 'Dest') instanceof PDFArray ? null : false;
		const action = at(link, 'A');
		if (link.has(PDFName.of('Dest')) || at(action, 'Next') !== undefined) return false;
		if (is(action, 'S', 'GoTo'))
			return at(action, 'D') instanceof PDFArray && copy(action, TO_PLACE);
		if (!is(action, 'S', 'URI')) return false;
		const uri = at(action, 'URI');
		// A URI is ASCII, so its start is read off the bytes. Decoded as text, an
		// address spelled in UTF-16 would pass here and be another one to a reader.
		const head =
			uri instanceof PDFString || uri instanceof PDFHexString
				? String.fromCharCode(...uri.asBytes().subarray(0, 8))
				: '';
		return /^https?:\/\//i.test(head) && copy(action, TO_ADDRESS);
	};

	const pages = doc.getPages();
	const kept = new Set<unknown>(pages.map((page) => page.ref));
	for (const page of pages) {
		const listed = at(page.node, 'Annots');
		const links = (listed instanceof PDFArray ? listed.asArray() : []).filter((entry) => {
			const link = context.lookup(entry);
			// An annotation that names its type names /Annot, so a page that lists
			// itself is no link, whatever else it says.
			const typed = at(link, 'Type') ?? PDFName.of('Annot');
			if (!is(link, 'Subtype', 'Link') || typed !== PDFName.of('Annot')) return false;
			const action = leads(link);
			if (action === false) return false;
			only(link, LINK);
			if (action) link.set(PDFName.of('A'), action);
			kept.add(entry);
			return true;
		});
		const crop = page.getCropBox();
		page.setMediaBox(crop.x, crop.y, crop.width, crop.height);
		only(page.node, PAGE);
		if (links.length > 0) page.node.set(PDFName.of('Annots'), context.obj(links));
	}
	const tree = doc.catalog.Pages();
	only(tree, TREE);
	tree.traverse((node) => {
		if (node instanceof PDFPageTree) only(node, TREE);
	});
	only(doc.catalog, CATALOG);
	context.trailerInfo.Info = undefined;

	for (const [ref, object] of context.enumerateIndirectObjects())
		if (!kept.has(ref) && (is(object, 'Type', 'Page') || annotation(object))) context.delete(ref);

	// What the catalog no longer reaches: the objects unlinked above, and the
	// fonts only the form's default resources named.
	const reached = new Set<PDFRef>();
	const pending: unknown[] = [context.trailerInfo.Root];
	while (pending.length > 0) {
		const value = pending.pop();
		if (value instanceof PDFRef) {
			if (reached.has(value)) continue;
			reached.add(value);
			pending.push(context.lookup(value));
		} else if (value instanceof PDFArray) pending.push(...value.asArray());
		else if (value instanceof PDFDict) pending.push(...value.values());
		else if (value instanceof PDFStream) pending.push(...value.dict.values());
	}
	// The trailer's /Size is the largest object number plus one, and deleting does
	// not lower it.
	let largest = 0;
	for (const [ref] of context.enumerateIndirectObjects()) {
		if (!reached.has(ref)) context.delete(ref);
		else if (ref.objectNumber > largest) largest = ref.objectNumber;
	}
	context.largestObjectNumber = largest;
	return doc.save({ useObjectStreams: false });
}
