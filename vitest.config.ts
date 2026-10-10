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

declare module 'vitest/browser' {
	interface BrowserCommands {
		withhold(asset: string): Promise<void>;
		serve(asset: string): Promise<void>;
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
						commands: { withhold, serve },
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
