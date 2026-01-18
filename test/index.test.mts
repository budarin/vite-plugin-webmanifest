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

    describe('with base: "/"', () => {
        beforeAll(async () => {
            await runBuild('/');
        });

        it('should generate manifest link pointing to root', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            expect(match![1]).toMatch(/^\/manifest-[\w-]+\.json$/);
        });

        it('should place manifest in root folder', async () => {
            const manifestFile = findManifestFile(distDir);
            expect(manifestFile).toBeTruthy();
            expect(manifestFile).toMatch(/^manifest-[\w-]+\.json$/);
        });
    });

    describe('with base: "./"', () => {
        beforeAll(async () => {
            await runBuild('./');
        });

        it('should generate manifest link with "./" prefix pointing to root', async () => {
            const html = await readDistFile('index.html');
            const match = html.match(/href="([^"]+manifest[^"]+\.json)"/);
            expect(match).toBeTruthy();
            expect(match![1]).toMatch(/^\.\/manifest-[\w-]+\.json$/);
        });
    });

});
