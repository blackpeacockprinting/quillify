import {
	PDFArray,
	PDFBool,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNull,
	PDFNumber,
	PDFRef,
	PDFStream,
	PDFString,
	type PDFObject
} from 'pdf-lib';
import { Refused } from './refusal.js';
import type { View } from './types.js';

/**
 * What a background's dictionaries keep. A kind of dictionary lists its keys,
 * and after a colon what a key leads to:
 *
 *     Key         a number, a name, a string, a boolean, null, or an array of those
 *     Key:kind    a dictionary or a stream of that kind
 *     Key:[kind]  one of them or an array of them
 *     Key:{kind}  a dictionary of them by name
 *     Key:^kind   a reference to one the walk reaches as that kind by another key
 *     Key:*       a value no row reads yet, kept whole
 *
 * A value of the first sort also stays where a kind is expected: a mask can be
 * an array of numbers. A kind `PICK` names is one of several, told apart by a
 * key of the dictionary. A kind `STREAMS` names is a stream, which keeps the
 * keys of `STREAM` beside its own, and no other kind is a stream.
 */
const KINDS: Record<string, string> = {
	catalog: 'Type Pages:tree OCProperties:* StructTreeRoot:* MarkInfo:* Lang',
	tree: 'Type Parent:^tree Kids:[node] Count Resources:resources Rotate',
	page:
		'Type Parent:^tree Resources:resources MediaBox Contents:[content] Rotate Group:* UserUnit ' +
		'StructParents Tabs Annots:[link]',
	link: 'Type Subtype Rect Border:* BS:* C H QuadPoints F OC:* Contents StructParent A:action Dest:*',
	uri: 'S URI',
	goto: 'S D:*',
	resources:
		'Font:{*} XObject:{xobject} ExtGState:{*} ColorSpace:{*} Pattern:{*} Shading:{*} ' +
		'Properties:{*} ProcSet',
	content: '',
	image:
		'Type Subtype Width Height BitsPerComponent ColorSpace:* Decode ImageMask Mask:image ' +
		'SMask:image SMaskInData Matte Interpolate Intent OC:* StructParent',
	form: 'Type Subtype FormType BBox Matrix Resources:resources Group:* OC:* StructParent StructParents',
	parms:
		'Predictor Colors BitsPerComponent Columns EarlyChange K EndOfLine EncodedByteAlign Rows ' +
		'EndOfBlock BlackIs1 DamagedRowsBeforeError ColorTransform JBIG2Globals:data',
	data: ''
};
const STREAMS = ['content', 'image', 'form', 'data'];
const STREAM = 'Length Filter DecodeParms:[parms]';
const PICK: Record<string, [key: string, kinds: Record<string, string>]> = {
	node: ['Type', { Pages: 'tree', Page: 'page' }],
	action: ['S', { URI: 'uri', GoTo: 'goto' }],
	xobject: ['Subtype', { Image: 'image', Form: 'form' }]
};

/**
 * What a key leads to: one of a kind, a list or a map of them, or a back
 * reference to one. A bare key leads to one of the kind `''` and `*` to one of
 * the kind `'*'`, and neither kind has a row.
 */
interface Slot {
	shape: 'one' | 'list' | 'map' | 'back';
	kind: string;
}
const SHAPES: Record<string, Slot['shape']> = { '[': 'list', '{': 'map', '^': 'back' };
const SLOTS = new Map<string, Slot>();
/** The slot a spelling of the table names. One spelling is one object, so the walk compares slots as they are. */
function slot(text: string): Slot {
	let read = SLOTS.get(text);
	if (!read) {
		const shape = SHAPES[text.charAt(0)] ?? 'one';
		read = { shape, kind: shape === 'one' ? text : text.replace(/[[\]{}^]/g, '') };
		SLOTS.set(text, read);
	}
	return read;
}
const WHOLE = slot('*');

/** Each kind's keys with the slot of each, and whether the kind is a stream. */
const ROWS = new Map(
	Object.entries(KINDS).map(([kind, keys]) => {
		const stream = STREAMS.includes(kind);
		const entries = (stream ? `${keys} ${STREAM}` : keys).split(' ').filter(Boolean);
		const row = entries.map((entry) => {
			const [key, leads = ''] = entry.split(':');
			return [PDFName.of(key), slot(leads)] as const;
		});
		return [kind, { stream, keys: new Map(row) }];
	})
);
const PICKS = new Map(
	Object.entries(PICK).map(([kind, [key, kinds]]) => [
		kind,
		{ key: PDFName.of(key), kinds: new Map(Object.entries(kinds)) }
	])
);

/**
 * The `acroform` background: the source file's pages, and of each dictionary
 * they hold the keys `KINDS` lists for its kind. With the rest of the catalog
 * go the form (`/AcroForm` with its XFA packet, `/NeedsRendering`), the XMP
 * metadata, the scripts, attachments, portfolio and bookmarks, and the
 * usage-rights signature under `/Perms`. The signature goes here because qpdf's
 * `--remove-restrictions`, which takes it too, also strips `/FT /Sig` from
 * every signature field. The trailer's `/Info` and `/ID` go too.
 *
 * Of a page's annotations a Link stays, when it leads to an http or https
 * address or to an explicit destination in the file, and leads there one way.
 * A named destination resolves through the catalog's `/Dests` or `/Names`,
 * which go, so a link to one goes too, and so does a link with an action
 * chained after its own. The action a link keeps is a copy, so nothing the file
 * hangs on the same object is cut with it.
 *
 * Each page's MediaBox is set to the box of its entry of `views`, the frame the
 * inventory measured that page's widgets in. No box of the file is read here. A
 * file whose pages are not the objects `views` names, in that order, is one
 * pdf.js and pdf-lib read differently, and is refused as `damaged`.
 *
 * A walk from the catalog, level by level, then gives each object the first
 * kind that reaches it. A dictionary loses every key its kind does not list and
 * every value that is not what its key leads to, and an object the walk does
 * not reach is deleted: a saved file carries every object the context holds,
 * reachable or not. The structure tree is kept whole and can still name an
 * annotation no page lists or a page outside the page tree. So an object that
 * reads as either and is not kept is deleted outright before the walk, and the
 * files, fields and appearance streams that hung off it are then out of its
 * reach: a background that still carries a form layer is one the renderer would
 * stamp a second one over.
 */
export async function stripAcroForm(bytes: Uint8Array, views: View[]): Promise<Uint8Array> {
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
		if (is(action, 'S', 'GoTo')) return at(action, 'D') instanceof PDFArray && action.clone();
		if (!is(action, 'S', 'URI')) return false;
		const uri = at(action, 'URI');
		// A URI is ASCII, so its start is read off the bytes. Decoded as text, an
		// address spelled in UTF-16 would pass here and be another one to a reader.
		const head =
			uri instanceof PDFString || uri instanceof PDFHexString
				? String.fromCharCode(...uri.asBytes().subarray(0, 8))
				: '';
		return /^https?:\/\//i.test(head) && action.clone();
	};

	const pages = doc.getPages();
	const differs = pages.some(({ ref }, index) => {
		const viewed = views[index]?.ref;
		return viewed?.num !== ref.objectNumber || viewed.gen !== ref.generationNumber;
	});
	if (differs || pages.length !== views.length) throw new Refused({ code: 'damaged' });
	const kept = new Set<unknown>(pages.map((page) => page.ref));
	for (const [index, page] of pages.entries()) {
		const listed = at(page.node, 'Annots');
		const links = (listed instanceof PDFArray ? listed.asArray() : []).filter((entry) => {
			const link = context.lookup(entry);
			// An annotation that names its type names /Annot, so a page that lists
			// itself is no link, whatever else it says.
			const typed = at(link, 'Type') ?? PDFName.of('Annot');
			if (!is(link, 'Subtype', 'Link') || typed !== PDFName.of('Annot')) return false;
			const action = leads(link);
			if (action === false) return false;
			if (action) link.set(PDFName.of('A'), action);
			kept.add(entry);
			return true;
		});
		page.node.set(PDFName.of('MediaBox'), context.obj(views[index].box));
		page.node.delete(PDFName.of('Annots'));
		if (links.length > 0) page.node.set(PDFName.of('Annots'), context.obj(links));
	}
	context.trailerInfo.Info = undefined;
	context.trailerInfo.ID = undefined;

	for (const [ref, object] of context.enumerateIndirectObjects())
		if (!kept.has(ref) && (is(object, 'Type', 'Page') || annotation(object))) context.delete(ref);

	const claimed = new Map<PDFRef, Slot>();
	const pending: [value: PDFArray | PDFDict | PDFStream, as: Slot][] = [];
	const whole: (PDFObject | undefined)[] = [];
	const backs: [holder: PDFDict, key: PDFName, value: PDFObject, to: Slot][] = [];

	/** Whether what a reference names leads nowhere: `false` while it is being read, so an array that holds itself leads somewhere. */
	const plains = new Map<PDFRef, boolean>();
	/** Whether a value leads nowhere. A reference is read once, whatever reaches it, and a `[reference]` among the parts marks where its own parts end. */
	const plain = (value: PDFObject) => {
		const parts: (PDFObject | [read: PDFRef] | undefined)[] = [value];
		while (parts.length > 0) {
			let part = parts.pop();
			if (Array.isArray(part)) {
				plains.set(part[0], true);
				continue;
			}
			if (part instanceof PDFRef) {
				const known = plains.get(part);
				if (known) continue;
				if (known === false) return false;
				plains.set(part, false);
				parts.push([part]);
				part = context.lookup(part);
			}
			if (part instanceof PDFArray) for (let i = 0; i < part.size(); i++) parts.push(part.get(i));
			else if (!(
				part instanceof PDFNumber ||
				part instanceof PDFName ||
				part instanceof PDFString ||
				part instanceof PDFHexString ||
				part instanceof PDFBool ||
				part === PDFNull
			))
				return false;
		}
		return true;
	};

	/** Gives an object its kind, the first that reaches it, and queues it. Whether this reach of it stays. */
	const claim = (raw: PDFObject | undefined, value: PDFArray | PDFDict | PDFStream, as: Slot) => {
		if (raw instanceof PDFRef) {
			const had = claimed.get(raw);
			if (had) return had === as;
			claimed.set(raw, as);
		}
		pending.push([value, as]);
		return true;
	};

	/** Whether a value stays where a key leads to `to`. */
	const reach = (raw: PDFObject, to: Slot): boolean => {
		if (to === WHOLE || plain(raw)) {
			whole.push(raw);
			return true;
		}
		if (!to.kind) return false;
		const value = raw instanceof PDFRef ? context.lookup(raw) : raw;
		if (to.shape === 'map') return value instanceof PDFDict && claim(raw, value, to);
		if (to.shape === 'list' && value instanceof PDFArray) return claim(raw, value, to);
		if (!(value instanceof PDFDict || value instanceof PDFStream)) return false;
		const pick = PICKS.get(to.kind);
		const told = pick && (value instanceof PDFStream ? value.dict : value).lookup(pick.key);
		const kind = pick ? told instanceof PDFName && pick.kinds.get(told.decodeText()) : to.kind;
		if (!kind || ROWS.get(kind)!.stream !== value instanceof PDFStream) return false;
		// A page is one the loop above framed. pdf-lib reads none in a dictionary
		// written inside /Kids that names its /Type by reference.
		if (kind === 'page' && !kept.has(raw)) return false;
		return claim(raw, value, slot(kind));
	};

	claim(context.trailerInfo.Root, doc.catalog, slot('catalog'));
	for (let next = 0; next < pending.length; next++) {
		const [value, as] = pending[next];
		if (value instanceof PDFArray) {
			let stay = 0;
			for (let i = 0; i < value.size(); i++) {
				const part = value.get(i);
				if (reach(part, slot(as.kind))) value.set(stay++, part);
			}
			while (value.size() > stay) value.remove(value.size() - 1);
		} else if (as.shape === 'map' && value instanceof PDFDict) {
			for (const [key, part] of value.entries()) if (!reach(part, slot(as.kind))) value.delete(key);
		} else {
			const dict = value instanceof PDFStream ? value.dict : value;
			const { keys } = ROWS.get(as.kind)!;
			for (const [key, part] of dict.entries()) {
				const to = keys.get(key);
				if (to?.shape === 'back') backs.push([dict, key, part, slot(to.kind)]);
				else if (!to || !reach(part, to)) dict.delete(key);
			}
		}
	}
	// A page that another key reaches first has that key's kind, and so has a
	// node or a /Kids above it: the page tree holds the page no more.
	if (pages.some(({ ref }) => claimed.get(ref) !== slot('page')))
		throw new Refused({ code: 'damaged' });
	// What no row reads and what leads nowhere are kept as they are and walked
	// last, so an object a row reaches has its row whatever else names it.
	while (whole.length > 0) {
		let value = whole.pop();
		if (value instanceof PDFRef) {
			if (claimed.has(value)) continue;
			claimed.set(value, WHOLE);
			value = context.lookup(value);
		}
		if (value instanceof PDFArray) for (let i = 0; i < value.size(); i++) whole.push(value.get(i));
		else if (value instanceof PDFDict) for (const part of value.values()) whole.push(part);
		else if (value instanceof PDFStream) for (const part of value.dict.values()) whole.push(part);
	}
	for (const [holder, key, value, to] of backs)
		if (claimed.get(value as PDFRef) !== to) holder.delete(key);

	// The trailer's /Size is the largest object number plus one, and deleting does
	// not lower it.
	let largest = 0;
	for (const [ref] of context.enumerateIndirectObjects()) {
		if (!claimed.has(ref)) context.delete(ref);
		else if (ref.objectNumber > largest) largest = ref.objectNumber;
	}
	context.largestObjectNumber = largest;
	return doc.save({ useObjectStreams: false });
}
