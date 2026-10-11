/** Geometry in PDF points, top-left origin, page-relative: the `acroform` backend's `rect`. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** AcroForm field type codes as pdf.js reports them. */
export const WIDGET_KINDS = ['Tx', 'Btn', 'Ch', 'Sig'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

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

/** A page as pdf.js read it. */
export interface View {
	/** The object that is the page, by number and generation: null when pdf.js gives none. */
	ref: { num: number; gen: number } | null;
	/** The page's frame in PDF space, pdf.js's `view` of it, which every rect of the page is measured in. */
	box: [x0: number, y0: number, x1: number, y1: number];
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

/** The largest file `sanitize` opens. It bounds the compressed input. */
export const MAX_BYTES = 8 * 1024 * 1024;
/**
 * The most a file may come to once qpdf has it: the file qpdf writes together
 * with what its Flate streams decode to, and qpdf's own memory. Of 1,423
 * published files the largest comes to 15,046,490 bytes (DAF 57), and qpdf's
 * memory is 17,235,968 bytes after each.
 */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
export const MAX_PAGES = 20;
export const MAX_WIDGETS = 200;
/**
 * How long `sanitize` works on a file before it refuses it. Of 59 published
 * forms the slowest takes 2.7 s (SF 2809).
 */
export const MAX_SECONDS = 60;
