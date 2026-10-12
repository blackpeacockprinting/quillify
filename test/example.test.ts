import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { expect, it, onTestFinished } from 'vitest';

/**
 * `style-src` is for the page's own stylesheet. `img-src data:` is for the
 * background the layout frame's stylesheet gives a field: without it a dynamic
 * form reads the same, and the browser logs what it refused.
 */
const POLICY =
	"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src data:; worker-src 'self'; connect-src 'self'";

it('builds the example from the packed tarball with no configuration, and fills DAF 1288 in it under a policy that refuses nothing', async () => {
	// A consumer's project: the app, the tarball where an install unpacks it,
	// and beside it the packages the tarball says it depends on.
	const app = mkdtempSync(join(tmpdir(), 'quillify-example-'));
	onTestFinished(() => rmSync(app, { recursive: true, force: true }));
	cpSync('examples', app, { recursive: true });
	const installed = join(app, 'node_modules/@quillmark/quillify');
	mkdirSync(installed, { recursive: true });
	const [{ filename }]: [{ filename: string }] = JSON.parse(
		execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', app], {
			encoding: 'utf8'
		})
	);
	execFileSync('tar', ['-xzf', join(app, filename), '-C', installed, '--strip-components=1']);
	const { dependencies, peerDependencies } = JSON.parse(
		readFileSync(join(installed, 'package.json'), 'utf8')
	);
	for (const name of Object.keys({ ...dependencies, ...peerDependencies }))
		symlinkSync(resolve('node_modules', name), join(app, 'node_modules', name));

	await build({ root: app, configFile: false, logLevel: 'silent' });
	const server = await preview({
		root: app,
		configFile: false,
		logLevel: 'silent',
		preview: { port: 0, headers: { 'Content-Security-Policy': POLICY } }
	});
	onTestFinished(() => server.close());

	const browser = await chromium.launch();
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	const policies = new Set<string>();
	const errors: string[] = [];
	page.on('response', (served) => policies.add(served.headers()['content-security-policy']));
	page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto(server.resolvedUrls!.local[0]);
	await page
		.getByLabel('PDF form')
		.setInputFiles('test/fixtures/DAF1288_Application_for_Ready_Reserve_Assignment.pdf');
	// By the keyboard: Enter in a field renders the copy, and Enter on the link
	// the page then focuses saves it.
	const phone = page.getByLabel('field_4_primary_phone');
	await phone.fill('907-555-0100');
	await phone.press('Enter');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.locator('a:focus').press('Enter')
	]);
	const filled = await PDFDocument.load(readFileSync(await download.path()));

	expect(await page.getByRole('listitem').count()).toBe(121);
	expect(filled.getForm().getTextField('p1.Page1.form1.MbrPhone').getText()).toBe('907-555-0100');
	expect([...policies]).toEqual([POLICY]);
	expect(errors).toEqual([]);
}, 60_000);
