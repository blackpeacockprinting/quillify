import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';

const BROWSER = '**/*.browser.test.ts';

// The test server serves assets/ from disk, so a test that needs an asset to
// be missing has the browser answer for it.
const withhold: BrowserCommand<[asset: string]> = ({ page }, asset) =>
	page.route(`**/assets/${asset}*`, (route) => route.fulfill({ status: 404 }));
const serve: BrowserCommand<[asset: string]> = ({ page }, asset) =>
	page.unroute(`**/assets/${asset}*`);

// A page's resource timing leaves out what its workers ask for, so a test that
// holds the library to its own files has the browser list every HTTP request.
const requested: string[] = [];
const note = (request: { url(): string }) => void requested.push(request.url());
const listen: BrowserCommand<[]> = ({ page }) => {
	requested.length = 0;
	page.context().on('request', note);
};
const heard: BrowserCommand<[]> = ({ page }) => {
	page.context().off('request', note);
	return [...requested];
};

declare module 'vitest/browser' {
	interface BrowserCommands {
		withhold(asset: string): Promise<void>;
		serve(asset: string): Promise<void>;
		listen(): Promise<void>;
		heard(): Promise<string[]>;
	}
}

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				test: {
					name: 'node',
					exclude: [...configDefaults.exclude, '**/dist/**', BROWSER]
				}
			},
			{
				test: {
					name: 'chromium',
					include: [BROWSER],
					browser: {
						enabled: true,
						headless: true,
						screenshotFailures: false,
						provider: playwright(),
						commands: { withhold, serve, listen, heard },
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
