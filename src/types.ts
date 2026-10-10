/** Geometry in PDF points, top-left origin, page-relative: the `acroform` backend's `rect`. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** AcroForm field type codes as pdf.js reports them. */
export type WidgetKind = 'Tx' | 'Btn' | 'Ch' | 'Sig';

/** One place a field is painted. */
export interface WidgetPlace {
	page: number;
	rect: Rect;
}

export interface InventoryWidget {
	/** Unique within the inventory: the field name, suffixed when a name repeats. */
	id: string;
	name: string;
	kind: WidgetKind;
	/**
	 * Everywhere this field is painted. More than one when a form repeats a box:
	 * one name is one value in the file, so typing into any of them fills them
	 * all, and treating them as separate fields asks for the same answer twice.
	 */
	places: WidgetPlace[];
	multiLine: boolean;
	checkBox: boolean;
	radioButton: boolean;
	combo: boolean;
	options: string[];
	readOnly: boolean;
	required: boolean;
	/** `/TU`, the hover text the form's author wrote. */
	tooltip?: string;
	/** `/MaxLen`, 0 when the field sets none. */
	maxLen: number;
	/** This widget's on-state name, which is how a radio group tells its options apart. */
	buttonValue?: string;
}

export interface FieldInventory {
	pages: { width: number; height: number }[];
	widgets: InventoryWidget[];
}

export type FieldType = 'string' | 'boolean' | 'enum' | 'array';

export interface QualifiedField {
	/** `InventoryWidget.id` */
	widget: string;
	/** snake_case schema field name */
	name: string;
	label: string;
	description: string;
	type: FieldType;
	multiline: boolean;
	options?: string[];
	example?: string;
	keep: boolean;
	/** `/Ff` bit 2: the form says this one has to be filled. */
	required: boolean;
	/** The radio group this option belongs to, when it is one. */
	group?: string;
}

export interface QualifiedForm {
	quill: { name: string; title: string; description: string };
	fields: QualifiedField[];
}

export const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/** A quill as files, the shape `Quill.fromTree` and a quiver both take. */
export type QuillTree = Map<string, Uint8Array>;

/** The largest file the importer opens. It bounds the compressed input. */
export const MAX_BYTES = 8 * 1024 * 1024;
/** The naming pass sends one raster per page, and a provider counts images. */
export const MAX_PAGES = 20;
/**
 * The rasters ride to the model as base64 in one JSON body. MAX_PAGES bounds the
 * provider's image count; this bounds the wire, and page count is a poor proxy
 * for it: eighteen vector pages are 5.8 MB and twenty scanned ones are 23 MB.
 */
export const MAX_RASTER_BYTES = 9 * 1024 * 1024;
/**
 * What the qualify route accepts: the rasters after base64's 4/3 inflation,
 * plus room for the inventory JSON. Derived from MAX_RASTER_BYTES rather than
 * written out, because a client that sends more than the server takes gets its
 * connection torn down mid-upload and reads as `Failed to fetch`.
 */
export const MAX_BODY_BYTES = Math.ceil((MAX_RASTER_BYTES * 4) / 3) + 4 * 1024 * 1024;
/** More widgets than one qualify call has been measured to name correctly. */
export const MAX_WIDGETS = 200;
