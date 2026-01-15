import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build, type InlineConfig } from 'vite';
import { webmanifestPlugin, type WebManifestPluginOptions } from '../src/index.mjs';
import { readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const distDir = path.join(fixturesDir, 'dist');

async function runBuild(base: string = '/', pluginOptions: WebManifestPluginOptions = {}) {
    await build({
        root: fixturesDir,
        base,
        logLevel: 'silent',
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            write: true,
        },
        plugins: [webmanifestPlugin(pluginOptions)],
    });
}

async function readDistFile(fileName: string): Promise<string> {
    return readFile(path.join(distDir, fileName), 'utf-8');
}

function findManifestFile(dir: string, subdir: string = ''): string | null {
    const fs = require('fs');
    const targetDir = subdir ? path.join(dir, subdir) : dir;
    if (!existsSync(targetDir)) return null;
    const files = fs.readdirSync(targetDir);
    const manifest = files.find((f: string) => f.startsWith('manifest') && f.endsWith('.json'));
    return manifest ? (subdir ? `${subdir}/${manifest}` : manifest) : null;
}

describe('webmanifestPlugin', () => {
    afterAll(async () => {
        if (existsSync(distDir)) {
            await rm(distDir, { recursive: true, force: true });
        }
    });

    describe('with base: "/" (default assets)', () => {
        beforeAll(async () => {
            await runBuild('/');
        });

        it('should generate manifest link with assets path', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            expect(match![1]).toMatch(/^\/assets\/manifest-[\w-]+\.json$/);
        });

        it('should place manifest in assets by default', async () => {
            const manifestFile = findManifestFile(distDir, 'assets');
            expect(manifestFile).toBeTruthy();
            expect(manifestFile).toMatch(/^assets\/manifest-[\w-]+\.json$/);
        });
    });

    describe('with base: "./" (default assets)', () => {
        beforeAll(async () => {
            await runBuild('./');
        });

        it('should generate manifest link with "./" prefix and assets path', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            expect(match![1]).toMatch(/^\.\/assets\/manifest-[\w-]+\.json$/);
        });
    });

    describe('with manifestOutput: "assets"', () => {
        beforeAll(async () => {
            await runBuild('/', { manifestOutput: 'assets' });
        });

        it('should place manifest in assets folder', async () => {
            const manifestFile = findManifestFile(distDir, 'assets');
            expect(manifestFile).toBeTruthy();
            expect(manifestFile).toMatch(/^assets\/manifest-[\w-]+\.json$/);
        });

        it('should have matching href in HTML', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            // Href should point to assets folder
            expect(match![1]).toMatch(/^\/assets\/manifest-[\w-]+\.json$/);
        });
    });

    describe('with manifestOutput: "root"', () => {
        beforeAll(async () => {
            await runBuild('/', { manifestOutput: 'root' });
        });

        it('should place manifest in root folder', async () => {
            const manifestFile = findManifestFile(distDir);
            expect(manifestFile).toBeTruthy();
            expect(manifestFile).toMatch(/^manifest-[\w-]+\.json$/);
        });

        it('should have matching href in HTML without assets prefix', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            expect(match![1]).not.toContain('assets');
        });
    });
});
