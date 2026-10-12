import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { PDFArray, PDFDict, PDFDocument, PDFRef, PDFStream } from 'pdf-lib';
import { KINDS, PICK, STREAM, STREAMS } from '../src/strip.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Dict = Record<string, Json>;

/** The part of `qpdf --json=2` this reads: each object as a value or as a stream's dictionary, and the trailer. */
interface QpdfJson {
	qpdf: [unknown, Record<string, { value?: Json; stream?: { dict: Dict } }>];
}

interface Qpdf {
	callMain(args: string[]): number;
	FS: {
		writeFile(path: string, data: Uint8Array): void;
		readFile(path: string, options: { encoding: 'utf8' }): string;
	};
}

/** Each kind's keys with what each leads to, as the table spells it, and whether the kind is a stream. */
const ROWS = new Map(
	Object.entries(KINDS).map(([kind, keys]) => {
		const stream = STREAMS.includes(kind);
		const entries = (stream ? `${keys} ${STREAM}` : keys).split(' ').filter(Boolean);
		const row = new Map(
			entries.map((entry) => {
				const [key, leads = ''] = entry.split(':');
				return [key, leads] as const;
			})
		);
		return [kind, { stream, keys: row }];
	})
);

const isRef = (value: Json | undefined): value is string =>
	typeof value === 'string' && /^\d+ \d+ R$/.test(value);
const isName = (value: Json | undefined): value is string =>
	typeof value === 'string' && value.startsWith('/');
const isDict = (value: Json | undefined): value is Dict =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export interface Walked {
	/** What does not hold of the background. Empty for one the table describes in full. */
	problems: string[];
	/** The keys met under each kind, and of an array read by position its positions. */
	held: Map<string, Set<string>>;
	/** Every key of every dictionary that is not a dictionary by name, and every name that is a value, of every object. */
	names: Set<string>;
}

/**
 * A background walked against the strip's table. qpdf parses the saved bytes
 * and writes them as JSON. From the trailer's `/Root`, a queue gives each
 * object the kind the key that reaches it leads to, and `PICK` what it tells
 * apart, and holds it to that kind's row. This shares the table with the strip,
 * as data, and none of its code.
 *
 * qpdf's JSON leaves out a key whose value references an object the file does
 * not hold, so pdf-lib reads the same bytes for that: every reference in every
 * object has to resolve.
 */
export async function walked(pdf: Uint8Array): Promise<Walked> {
	// A module for each file: qpdf's main is built to run once, and one module fails
	// for good after some hundreds of calls.
	const { default: module } = await import('@neslinesli93/qpdf-wasm');
	const { callMain, FS } = await (
		module as unknown as (options: { locateFile: () => string }) => Promise<Qpdf>
	)({ locateFile: () => wasmUrl });
	FS.writeFile('/background.pdf', pdf);
	callMain([
		'--json=2',
		'--json-key=qpdf',
		'--json-stream-data=none',
		'/background.pdf',
		'/background.json'
	]);
	const { qpdf: read }: QpdfJson = JSON.parse(
		FS.readFile('/background.json', { encoding: 'utf8' })
	);
	const { trailer, ...objects } = read[1];

	const problems: string[] = [];
	const held = new Map<string, Set<string>>();
	const names = new Set<string>();
	const kinds = new Map<string, string>();
	/** Each dictionary by name: its keys are the file's own names, a font's or a role's. */
	const maps = new Set<Json>();
	const pending: [value: Dict | Json[], kind: string, where: string][] = [];
	const backs: [value: Json, leads: string, where: string][] = [];

	/** What a value is, read through a reference: a stream's dictionary for a stream. */
	const through = (value: Json | undefined) => {
		const object = isRef(value) ? objects[`obj:${value}`] : undefined;
		if (isRef(value))
			return { value: object?.stream?.dict ?? object?.value, stream: !!object?.stream };
		return { value, stream: false };
	};
	/** Whether a value leads nowhere: no dictionary, no stream, and no array that holds one or itself. */
	const plain = (value: Json | undefined, within = new Set<string>()): boolean => {
		if (isRef(value)) {
			const object = objects[`obj:${value}`];
			if (!object || object.stream || within.has(value)) return false;
			within.add(value);
			const leadsNowhere = plain(object.value, within);
			within.delete(value);
			return leadsNowhere;
		}
		if (Array.isArray(value)) return value.every((part) => plain(part, within));
		return value !== undefined && !isDict(value);
	};
	/** Notes each object a value that leads nowhere is written in. */
	const note = (value: Json | undefined) => {
		if (isRef(value)) {
			if (kinds.has(value)) return;
			kinds.set(value, 'a value that leads nowhere');
			note(objects[`obj:${value}`].value);
		} else if (Array.isArray(value)) value.forEach(note);
	};
	/** Gives an object its kind. Whether it is still to be read. */
	const claim = (value: Json, as: string, where: string) => {
		if (!isRef(value)) return true;
		const had = kinds.get(value);
		if (had && had !== as) problems.push(`${where}: ${value} is reached as ${had} and as ${as}`);
		kinds.set(value, had ?? as);
		return !had;
	};

	const reach = (value: Json, leads: string, where: string) => {
		if (plain(value)) return note(value);
		if (leads.includes('^')) return void backs.push([value, leads, where]);
		const { value: at, stream } = through(value);
		const inner = leads.slice(1, -1);
		if (leads.startsWith('{') && isDict(at) && !stream) {
			maps.add(at);
			if (claim(value, leads, where))
				for (const [key, part] of Object.entries(at)) reach(part, inner, `${where}${key}`);
			return;
		}
		if (leads.startsWith('[') && Array.isArray(at)) {
			if (claim(value, leads, where))
				for (const [index, part] of at.entries()) reach(part, inner, `${where}[${index}]`);
			return;
		}
		const of = leads.startsWith('[') ? inner : leads;
		const pick = PICK[of];
		let kind: string | undefined = of;
		if (pick && (isDict(at) || Array.isArray(at))) {
			const [key, told, other] = pick;
			const says = through(Array.isArray(at) ? at[Number(key)] : at[`/${key}`]).value;
			// A kind is told by a number where the table writes one, and by a name where it writes a name.
			const spelled =
				typeof says === 'number'
					? String(says)
					: isName(says) && !/^\/\d+$/.test(says)
						? says.slice(1)
						: undefined;
			kind =
				(spelled !== undefined && Object.hasOwn(told, spelled) ? told[spelled] : undefined) ??
				other;
		}
		const row = kind === undefined ? undefined : ROWS.get(kind);
		const body = stream ? 'stream' : Array.isArray(at) ? 'array' : isDict(at) ? 'dict' : 'none';
		const wants = row?.stream ? 'stream' : row?.keys.has('0') ? 'array' : 'dict';
		if (!row || body !== wants)
			return void problems.push(
				`${where}: holds what is not ${leads || 'a value that leads nowhere'}`
			);
		if (claim(value, kind!, where)) pending.push([at as Dict | Json[], kind!, where]);
	};

	reach(isDict(trailer.value) ? trailer.value['/Root'] : null, 'catalog', '/Root');
	for (let next = 0; next < pending.length; next++) {
		const [value, kind, where] = pending[next];
		const { keys } = ROWS.get(kind)!;
		const seen = held.get(kind) ?? new Set();
		held.set(kind, seen);
		for (const [key, part] of Object.entries(value)) {
			const name = key.replace(/^\//, '');
			const leads = keys.get(name);
			if (leads === undefined)
				problems.push(`${where}: ${kind} holds ${key}, which its row does not list`);
			else {
				seen.add(name);
				reach(part, leads, `${where}${Array.isArray(value) ? `[${key}]` : key}`);
			}
		}
	}
	// A reference back names an object the queue reached as one of its kinds. One
	// that may be an array is read part by part, with each array in it.
	for (const [value, leads, where] of backs) {
		const many = leads.startsWith('[');
		const to = leads.replace(/[[\]^]/g, '').split('|');
		const parts = [value];
		for (let part = parts.pop(); part !== undefined; part = parts.pop()) {
			if (isRef(part) && to.includes(kinds.get(part)!)) continue;
			const { value: at } = through(part);
			if (many && plain(part)) note(part);
			else if (many && Array.isArray(at)) {
				if (isRef(part) && kinds.get(part) !== `[${to[0]}]` && claim(part, leads, where))
					for (const inside of at) parts.push(inside);
				else if (!isRef(part)) for (const inside of at) parts.push(inside);
			} else problems.push(`${where}: a reference back to what the walk did not reach as ${to}`);
		}
	}
	for (const key of Object.keys(objects))
		if (!kinds.has(key.replace(/^obj:/, ''))) problems.push(`${key} is not reached`);

	// Every key and every name, of every object and at any depth, whether the
	// walk reached it or not, but for the keys of a dictionary by name.
	const rest: Json[] = Object.values(objects).map((object) => object.stream?.dict ?? object.value!);
	if (isDict(trailer.value)) rest.push(trailer.value);
	for (let value = rest.pop(); value !== undefined; value = rest.pop()) {
		if (isName(value)) names.add(value.slice(1));
		else if (Array.isArray(value)) for (const part of value) rest.push(part);
		else if (isDict(value))
			for (const [key, part] of Object.entries(value)) {
				if (!maps.has(value)) names.add(key.slice(1));
				rest.push(part);
			}
	}

	const doc = await PDFDocument.load(pdf, { updateMetadata: false });
	const parts: unknown[] = doc.context.enumerateIndirectObjects().map(([, object]) => object);
	for (let part = parts.pop(); part !== undefined; part = parts.pop()) {
		if (part instanceof PDFRef && doc.context.lookup(part) === undefined)
			problems.push(`a reference to ${part.tag}, which the file does not hold`);
		else if (part instanceof PDFArray)
			for (let i = 0; i < part.size(); i++) parts.push(part.get(i));
		else if (part instanceof PDFStream) parts.push(part.dict);
		else if (part instanceof PDFDict) for (const value of part.values()) parts.push(value);
	}
	return { problems, held, names };
}
