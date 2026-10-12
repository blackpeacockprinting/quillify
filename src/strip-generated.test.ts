/**
 * `stripAcroForm` over files no case wrote. A seeded generator hangs an object
 * graph on a catalog, a page tree and a page: dictionaries, arrays, streams
 * and references, most often what a key of the table leads to and otherwise
 * anything, under the keys of the row, keys of other rows and keys no row
 * lists. A few objects are shared, so two keys reach one of them and an object
 * can hold itself. Each file is refused, or its background is read back by the
 * table: every key of a dictionary is one its row lists, with what the row
 * says it leads to, the file holds no object that reading does not reach, and
 * none but a link says `/Type /Annot` or `/Subtype /Widget`. A file that is
 * stripped keeps its page, the page's content, and each dictionary the
 * generator hung on the envelope where its key leads to one.
 * A failure prints the smallest file that makes it.
 */

import fc from 'fast-check';
import {
	PDFArray,
	PDFBool,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNull,
	PDFNumber,
	PDFRef,
	PDFStream,
	PDFString,
	type PDFObject
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { Refused } from './refusal.js';
import { KINDS, PICK, STREAM, STREAMS, stripAcroForm } from './strip.js';

const SEED = 190;
const RUNS = 300;

/** Each kind's keys, and what each leads to as the table spells it. */
const ROWS = new Map(
	Object.entries(KINDS).map(([kind, keys]) => [
		kind,
		new Map(
			`${keys} ${STREAMS.includes(kind) ? STREAM : ''}`
				.split(' ')
				.filter(Boolean)
				.map((entry) => entry.split(':'))
				.map(([key, leads = '']) => [key, leads])
		)
	])
);
const LISTED = [...ROWS.values()].flatMap((row) => [...row]);
const UNLISTED = ['Sample', 'AcroForm', 'AA', 'JS', 'Next', 'Metadata'];
/** What the strip reads a page or an annotation by, whatever key reaches it. */
const TELLING: [key: string, value: PDFObject][] = [
	['Type', PDFName.of('Annot')],
	['Type', PDFName.of('Page')],
	['Subtype', PDFName.of('Widget')],
	['Subtype', PDFName.of('Link')],
	['Rect', PDFNumber.of(0)]
];
const LEAVES: PDFObject[] = [
	...[0, 1, 2, 3].map((number) => PDFNumber.of(number)),
	...['Page', 'Pages', 'Annot', 'Link', 'Widget'].map((name) => PDFName.of(name)),
	PDFString.of('https://example.com/'),
	PDFString.of('A'),
	PDFBool.True,
	PDFNull
];

/** A file with one page, and on its catalog, page tree and page what `g` draws. */
async function generated(g: fc.GeneratorValue): Promise<Uint8Array> {
	const doc = await PDFDocument.create({ updateMetadata: false });
	const { context, catalog } = doc;
	const page = doc.addPage([612, 792]);
	const roll = (sides: number) => g(fc.nat, { max: sides - 1 });
	const any = <T>(of: readonly T[]) => of[roll(of.length)];
	const put = (object: PDFObject) => (roll(3) ? object : context.register(object));
	const envelope = [
		page.ref,
		catalog.get(PDFName.of('Pages')),
		context.trailerInfo.Root
	] as PDFRef[];
	const shared = [context.nextRef(), context.nextRef(), context.nextRef()];
	const assigned = new Set<PDFRef>();

	const value = (leads: string, depth: number): PDFObject => {
		const turn = roll(48);
		if (turn < 1 || (leads.includes('^') && turn < 36)) {
			const ref = any([...envelope, ...shared]);
			if (shared.includes(ref) && !assigned.has(ref)) {
				assigned.add(ref);
				context.assign(ref, value(leads, depth + 1));
			}
			return ref;
		}
		if (turn < 5 || depth > 6 || (!leads && turn < 36)) return any(LEAVES);
		const within = leads.slice(1, -1);
		if (turn < 40 && (!leads || leads.startsWith('[')))
			return put(
				context.obj(Array.from({ length: roll(4) }, () => value(any([within, leads]), depth + 1)))
			);
		if (turn < 40 && leads.startsWith('{'))
			return put(
				context.obj(
					Object.fromEntries(
						Array.from({ length: roll(4) }, (_, index) => [`X${index}`, value(within, depth + 1)])
					)
				)
			);
		return object(any(leads.replace(/[^\w|]/g, '').split('|')), depth);
	};

	const keys = (row: Map<string, string>, depth: number) => {
		const parts = new Map<string, PDFObject>();
		for (const [key, to] of row) if (roll(2)) parts.set(key, value(to, depth + 1));
		for (let more = roll(3); more > 0; more--) {
			const [key, to] = any(LISTED);
			parts.set(roll(2) ? key : any(UNLISTED), value(to, depth + 1));
		}
		if (!roll(4)) parts.set(...any(TELLING));
		return parts;
	};

	const object = (leads: string, depth: number): PDFObject => {
		const pick = PICK[leads];
		const told = pick ? any([...Object.keys(pick[1]), '']) : '';
		const kind = (pick ? (pick[1][told] ?? pick[2]) : leads) ?? '';
		const tell = Number.isNaN(Number(told)) ? PDFName.of(told) : PDFNumber.of(Number(told));
		const row = ROWS.get(kind) ?? any([...ROWS.values()]);
		if (row.has('0')) {
			const list = [...row].map(([key, to]) =>
				told && key === pick[0] ? tell : value(to, depth + 1)
			);
			return put(context.obj(roll(4) ? list : [...list, any(LEAVES)]));
		}
		const parts = keys(row, depth);
		if (told) parts.set(pick[0], tell);
		// What makes a link one the strip keeps is in no row: it says it is one and leads one way.
		if (kind === 'link' && roll(4)) {
			parts.set('Subtype', PDFName.of('Link'));
			for (const key of ['Type', roll(2) ? 'A' : 'Dest']) parts.delete(key);
		}
		const dict = Object.fromEntries(parts);
		return STREAMS.includes(kind) === Boolean(roll(8))
			? context.register(context.stream('x', dict))
			: put(context.obj(dict));
	};

	// The envelope keeps its own keys.
	const holders: [holder: PDFDict, kind: string, own: string[]][] = [
		[page.node, 'page', ['Type', 'Parent', 'MediaBox']],
		[catalog.Pages(), 'tree', ['Type', 'Kids', 'Count']],
		[catalog, 'catalog', ['Type', 'Pages']]
	];
	for (const [holder, kind, own] of holders)
		for (const [key, part] of keys(ROWS.get(kind)!, 0))
			if (!own.includes(key)) holder.set(PDFName.of(key), part);
	return doc.save({ useObjectStreams: false });
}

/** Reads a background from its catalog by the table, and fails at what the table does not say. */
function read({ context }: PDFDocument) {
	const reached = new Map<PDFRef, string>();
	const backs: [part: PDFObject, to: string][] = [];
	const held = (raw: PDFObject) => (raw instanceof PDFRef ? context.lookup(raw) : raw);

	/** Whether a value leads nowhere, as the strip reads it: an array that holds itself leads somewhere. */
	const plain = (raw: PDFObject, over: unknown[] = []): boolean => {
		const value = held(raw);
		if (value instanceof PDFArray)
			return (
				!over.includes(value) && value.asArray().every((part) => plain(part, [...over, value]))
			);
		return value !== undefined && !(value instanceof PDFDict || value instanceof PDFStream);
	};
	const whole = (raw: PDFObject) => {
		if (raw instanceof PDFRef) {
			if (reached.has(raw)) return;
			reached.set(raw, '');
		}
		const value = held(raw);
		if (value instanceof PDFArray) value.asArray().forEach(whole);
		else if (value instanceof PDFDict) value.values().forEach(whole);
		else if (value instanceof PDFStream) value.dict.values().forEach(whole);
	};

	const follow = (part: PDFObject, to: string) =>
		to.includes('^') ? backs.push([part, to]) : visit(part, to);
	const visit = (raw: PDFObject, leads: string): void => {
		if (leads === '*' || plain(raw)) return whole(raw);
		const value = held(raw);
		const body = value instanceof PDFStream ? value.dict : value;
		const within = leads.slice(1, -1);
		let as = leads;
		if (leads.startsWith('{')) expect(value, leads).toBeInstanceOf(PDFDict);
		else if (!(leads.startsWith('[') && value instanceof PDFArray)) {
			as = leads.startsWith('[') ? within : leads;
			const pick = PICK[as];
			if (pick) {
				const told =
					body instanceof PDFArray
						? body.lookup(Number(pick[0]))
						: (body as PDFDict).lookup(PDFName.of(pick[0]));
				const name =
					told instanceof PDFNumber
						? told.asNumber()
						: told instanceof PDFName
							? told.decodeText()
							: '';
				as = pick[1][name] ?? pick[2] ?? '';
			}
			expect(ROWS.has(as), `a value where ${leads || 'a bare key'} leads`).toBe(true);
			expect(
				value instanceof PDFStream ? 'stream' : value instanceof PDFArray ? 'array' : 'dict',
				as
			).toBe(STREAMS.includes(as) ? 'stream' : ROWS.get(as)!.has('0') ? 'array' : 'dict');
		}
		if (raw instanceof PDFRef) {
			if (reached.has(raw)) return expect(reached.get(raw), `${raw}`).toBe(as);
			reached.set(raw, as);
		}
		if (leads.startsWith('[') && value instanceof PDFArray)
			for (const part of value.asArray()) visit(part, within);
		else if (leads.startsWith('{'))
			for (const part of (value as PDFDict).values()) visit(part, within);
		else if (body instanceof PDFArray) {
			const row = [...ROWS.get(as)!.values()];
			expect(body.size(), as).toBeLessThanOrEqual(row.length);
			body.asArray().forEach((part, index) => follow(part, row[index]));
		} else
			for (const [key, part] of (body as PDFDict).entries()) {
				const to = ROWS.get(as)!.get(key.decodeText());
				expect(to, `${key} of ${as}`).toBeDefined();
				follow(part, to!);
			}
	};
	visit(context.trailerInfo.Root!, 'catalog');

	for (const [part, to] of backs) {
		const kinds = to.replace(/[^\w|]/g, '').split('|');
		const stays = (raw: PDFObject): void => {
			const had = raw instanceof PDFRef ? reached.get(raw) : undefined;
			if (had !== undefined && kinds.includes(had)) return;
			if (!to.startsWith('[')) return expect(raw, to).toBe(PDFNull);
			if (had === `[${kinds[0]}]` || had === to) return;
			if (!(raw instanceof PDFArray) && plain(raw)) return whole(raw);
			const value = held(raw);
			expect(value, to).toBeInstanceOf(PDFArray);
			if (raw instanceof PDFRef) reached.set(raw, to);
			(value as PDFArray).asArray().forEach(stays);
		};
		stays(part);
	}
	for (const [ref, object] of context.enumerateIndirectObjects()) {
		expect(reached.has(ref), `${ref} is reached`).toBe(true);
		if (!(object instanceof PDFDict) || reached.get(ref) === 'link') continue;
		expect(object.lookup(PDFName.of('Type')), `${ref} says its type`).not.toBe(PDFName.of('Annot'));
		expect(object.lookup(PDFName.of('Subtype')), `${ref} says its subtype`).not.toBe(
			PDFName.of('Widget')
		);
	}
}

it(`refuses, or strips to the table, each of ${RUNS} generated files of seed ${SEED}`, async () => {
	let stripped = 0;
	await fc.assert(
		fc.asyncProperty(fc.gen(), async (g) => {
			const source = await generated(g);
			try {
				const views = await viewsOf(source, [[0, 0, 612, 792]]);
				const background = await stripAcroForm(source, views).catch((thrown: unknown) => {
					expect(thrown).toBeInstanceOf(Refused);
				});
				if (!background) return;
				const after = await PDFDocument.load(background, { updateMetadata: false });
				read(after);
				// What the generator hung on the envelope is still there: a dictionary
				// where its key leads to one, and the page's content.
				const before = await PDFDocument.load(source, { updateMetadata: false });
				expect(after.getPageCount()).toBe(before.getPageCount());
				const envelope = (doc: PDFDocument): [kind: string, holder: PDFDict][] => [
					['page', doc.getPage(0).node],
					['tree', doc.catalog.Pages()],
					['catalog', doc.catalog]
				];
				const left = envelope(after);
				for (const [index, [kind, holder]] of envelope(before).entries())
					for (const [key, to] of ROWS.get(kind)!) {
						const had = holder.lookup(PDFName.of(key));
						const has = left[index][1].lookup(PDFName.of(key));
						const row = STREAMS.includes(to) ? undefined : ROWS.get(to);
						if (had instanceof PDFDict && row && !row.has('0'))
							expect(has, `${key} of the ${kind}`).toBeInstanceOf(PDFDict);
						if (key === 'Contents' && (had instanceof PDFArray || had instanceof PDFStream))
							expect(has?.constructor, `${key} of the ${kind}`).toBe(had.constructor);
					}
				stripped++;
			} catch (thrown) {
				throw new Error(`${thrown}\n${new TextDecoder('latin1').decode(source)}`, {
					cause: thrown
				});
			}
		}),
		// Shrinking stops in time for the failure to be printed, and a run the
		// limit ends before its last file fails.
		{
			seed: SEED,
			numRuns: RUNS,
			interruptAfterTimeLimit: 30_000,
			markInterruptAsFailure: true
		}
	);
	expect(stripped).toBeGreaterThan(RUNS / 3);
}, 60_000);
