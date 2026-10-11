import { execFileSync } from 'node:child_process';
import { hash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';

const modules = readdirSync('src')
	.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
	.map((name) => name.slice(0, -3));
const read = (path: string) => readFileSync(path, 'utf8');
const installed = (name: string): string =>
	JSON.parse(read(`node_modules/${name}/package.json`)).version;

it('reads a build that is no older than the source it was made from', () => {
	const built = statSync('dist/index.js', { throwIfNoEntry: false })?.mtimeMs ?? 0;
	expect(
		modules.filter((name) => statSync(`src/${name}.ts`).mtimeMs > built),
		'dist/ is missing or older than these modules. Run `npm run build`.'
	).toEqual([]);
});

it('packs the build, the assets and their notices, and nothing else', () => {
	const [{ files }]: [{ files: { path: string }[] }] = JSON.parse(
		execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' })
	);
	expect(files.map((file) => file.path).sort()).toEqual(
		[
			'package.json',
			'README.md',
			'NOTICE',
			'licenses/pdf.js-LICENSE',
			'assets/pdf.worker.js',
			'assets/qpdf.wasm',
			'assets/xfa-layer.js',
			'assets/xfa-layer.d.ts',
			...modules.flatMap((name) => [`dist/${name}.js`, `dist/${name}.d.ts`])
		].sort()
	);
});

it('gives plain Node, where there is no DOM, its four functions under its own name', () => {
	const exported = execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'--eval',
			"console.log(Object.keys(await import('quillify')).sort().join(' '))"
		],
		{ encoding: 'utf8' }
	);
	expect(exported.trim()).toBe('check quillify sanitize suggest');
});

it('declares the four functions and the public types, and no other name', () => {
	const declared = read(JSON.parse(read('package.json')).exports['.'].types).trim();
	const lists = [...declared.matchAll(/^export (?:type )?\{([^}]*)\} from '[^']+';$/gm)];
	// Every line is one such list, so nothing is exported by a star or declared in place.
	expect(lists).toHaveLength(declared.split('\n').length);
	expect(lists.flatMap(([, list]) => list.split(',').map((name) => name.trim())).sort()).toEqual(
		[
			'check',
			'suggest',
			'quillify',
			'type Quillified',
			'sanitize',
			'type Sanitized',
			...['Field', 'FieldNaming', 'Form', 'Naming', 'Place', 'Problem', 'Size', 'Refusal', 'Rect']
		].sort()
	);
});

it('says in NOTICE which pdf.js and which qpdf.wasm it redistributes', () => {
	const notice = read('NOTICE');
	expect(notice.match(/pdfjs-dist \d+\.\d+\.\d+/g)).toEqual(
		Array(2).fill(`pdfjs-dist ${installed('pdfjs-dist')}`)
	);
	expect(notice).toContain(`@neslinesli93/qpdf-wasm ${installed('@neslinesli93/qpdf-wasm')}`);
	expect(notice).toContain(hash('sha256', readFileSync('assets/qpdf.wasm')));
});

it("ships the lines of pdf.js's viewer stylesheet that NOTICE names, unchanged", () => {
	const [, first, last] = /Lines (\d+) to (\d+) of web\/pdf_viewer\.css/.exec(read('NOTICE'))!;
	const upstream = read('node_modules/pdfjs-dist/web/pdf_viewer.css').split('\n');
	const shipped = read('src/xfa-layer.css');
	expect(shipped.slice(shipped.indexOf('*/') + 2).trim()).toBe(
		upstream
			.slice(+first - 1, +last)
			.join('\n')
			.trim()
	);
});
