#!/usr/bin/env node
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// pdfkit resolve seus arquivos .afm (fontes padrao) com caminho relativo ao
// proprio modulo em runtime. Como o esbuild bundla tudo em dist/index.mjs,
// esse caminho relativo passa a apontar para dist/data/, que nao existe por
// padrao. Sem isso, qualquer geracao de PDF falha com ENOENT no primeiro uso.
function copyPdfkitFonts() {
  const src = path.join(projectRoot, 'node_modules', 'pdfkit', 'js', 'data');
  const dest = path.join(projectRoot, 'dist', 'data');
  if (!fs.existsSync(src)) {
    console.log('ℹ️  pdfkit nao encontrado em node_modules, pulando copia de fontes');
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.afm'));
  for (const f of files) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  console.log(`✅ ${files.length} fontes do pdfkit copiadas para dist/data/`);
}

async function build() {
  try {
    console.log('🔨 Building server...');
    
    await esbuild.build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile: 'dist/index.mjs',
      external: [
        'pg-native',
        'better-sqlite3',
        'mysql2',
        'tedious',
        'oracledb',
        'pg-query-stream',
        '@aws-sdk/*',
        'fsevents',
        'lightningcss',
        'esbuild',
        '@rollup/rollup-linux-x64-gnu',
        'vite',
        '@vitejs/plugin-react-swc',
      ],
      loader: {
        '.node': 'copy',
      },
      banner: {
        js: `
import { createRequire as _createRequire } from 'module';
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname as _dirnameFn } from 'path';
const require = _createRequire(import.meta.url);
// Usamos globalThis para evitar conflito com redecklaracoes internas de __filename/__dirname
globalThis.__filename = globalThis.__filename || _fileURLToPath(import.meta.url);
globalThis.__dirname = globalThis.__dirname || _dirnameFn(globalThis.__filename);
`,
      },
      sourcemap: false,
      minify: false,
      keepNames: true,
    });
    
    copyPdfkitFonts();

    console.log('✅ Server build complete: dist/index.mjs');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
