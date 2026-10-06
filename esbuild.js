const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Plugin to copy static assets from src/<folder> to dist/<folder>
 */
const COPY_FOLDERS = [
	['webview', ['index.html', 'styles.css', 'app.js']],
	['setup', ['mayaSetup.py']],
];

const copyAssetsPlugin = {
	name: 'copy-assets',

	setup(build) {
		build.onEnd(() => {
			const fs = require('fs');
			const path = require('path');

			COPY_FOLDERS.forEach(([folder, files]) => {
				const srcDir = path.join(__dirname, 'src', folder);
				const distDir = path.join(__dirname, 'dist', folder);

				if (!fs.existsSync(distDir)) {
					fs.mkdirSync(distDir, { recursive: true });
				}

				files.forEach(file => {
					const srcFile = path.join(srcDir, file);
					if (!fs.existsSync(srcFile)) return;
					fs.copyFileSync(srcFile, path.join(distDir, file));
				});
			});

			console.log('Copied static assets to dist/');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			copyAssetsPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
