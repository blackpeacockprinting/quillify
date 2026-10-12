import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

interface Entry {
	list: string;
	url: string;
	retrieved: string;
	sha256: string;
	kind: string;
	encryption: string;
	outcome: string;
	notice?: true;
	pages?: number;
	fields?: number;
	construct?: string;
	problem?: string;
	xfa?: boolean;
}

const files: Entry[] = JSON.parse(readFileSync('corpus/af-epubs.manifest.json', 'utf8'));
const departmental = files.filter((file) => file.list === 'Departmental');
const converted = files.filter((file) => file.outcome === 'converted');

function count(
	key: 'list' | 'kind' | 'encryption' | 'outcome' | 'construct' | 'problem',
	of = files
) {
	const counted: Record<string, number> = {};
	for (const file of of) {
		const value = file[key];
		if (value !== undefined) counted[value] = (counted[value] ?? 0) + 1;
	}
	return counted;
}

it('names 1,354 files on the thirteen lists the record tabulates', () => {
	expect(files).toHaveLength(1354);
	expect(new Set(files.map((file) => file.sha256)).size).toBe(1351);
	expect(count('list')).toEqual({
		Departmental: 966,
		'Air Education and Training Command': 122,
		'Air Force Materiel Command': 92,
		'Air Force Global Strike Command': 58,
		'Air Mobility Command': 44,
		'Air Force Special Operations Command': 21,
		'Air Force Reserve Command': 20,
		'Air Combat Command': 16,
		'United States Air Force in Europe-AF Africa': 5,
		'Air National Guard': 4,
		'SF/S1': 3,
		'Pacific Air Force': 2,
		'Combat Forces Command': 1
	});
});

it('records where each file was fetched, and that it was on 10 October 2026', () => {
	for (const file of files) {
		expect(file.url).toMatch(/^https:\/\/static\.e-publishing\.af\.mil\/.+\.pdf$/i);
		expect(file.retrieved).toMatch(/^2026-10-10T\d\d:\d\d:\d\dZ$/);
	}
});

it('holds the kinds and the encryption the record tabulates', () => {
	expect(count('kind')).toEqual({ dynamic: 946, hybrid: 263, plain: 17, none: 128 });
	expect(count('kind', departmental)).toEqual({ dynamic: 702, hybrid: 128, plain: 16, none: 120 });
	expect(count('encryption')).toEqual({
		none: 72,
		'AESv2, R4, empty user password': 1271,
		'AESv3, R6, empty user password': 6,
		'RC4, R2, empty user password': 4,
		'RC4, R3, empty user password': 1
	});
});

it('holds the outcomes the record tabulates', () => {
	expect(count('outcome')).toEqual({
		converted: 1143,
		no_fields: 160,
		too_many_fields: 17,
		unpaintable: 16,
		problems: 14,
		portfolio: 4
	});
	expect(count('outcome', departmental)).toEqual({
		converted: 792,
		no_fields: 148,
		unpaintable: 12,
		too_many_fields: 10,
		portfolio: 4
	});
	expect(count('kind', converted)).toEqual({ dynamic: 885, hybrid: 241, plain: 17 });
	expect({
		pages: converted.reduce((total, file) => total + file.pages!, 0),
		fields: converted.reduce((total, file) => total + file.fields!, 0),
		longest: Math.max(...converted.map((file) => file.pages!))
	}).toEqual({ pages: 1916, fields: 159870, longest: 19 });
});

it('holds what the record says stands in the way, where a line gives the reason', () => {
	expect(count('construct')).toEqual({ glyph: 11, transform: 4, svg: 1 });
	expect(count('problem')).toEqual({ nothing_kept: 14 });

	const over = files
		.filter((file) => file.outcome === 'too_many_fields')
		.map((file) => file.fields!)
		.sort((a, b) => a - b);
	expect({ fewest: over[0], most: over.at(-1), median: over[8] }).toEqual({
		fewest: 1009,
		most: 2039,
		median: 1122
	});
});

it('holds the files with no field to what the record says they are', () => {
	const unfielded = files.filter((file) => file.outcome === 'no_fields');
	expect({
		xfaNothingLaidOut: unfielded.filter((file) => file.xfa).length,
		dynamic: unfielded.filter((file) => file.kind === 'dynamic').length,
		notices: files.filter((file) => file.notice).length,
		noticesAmongThem: unfielded.filter((file) => file.notice).length
	}).toEqual({ xfaNothingLaidOut: 87, dynamic: 36, notices: 14, noticesAmongThem: 14 });
});
