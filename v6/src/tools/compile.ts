/**
 * CLI tool: Compile Mini-C (.c) to assembly (.asm).
 *
 * Usage: npx tsx src/tools/compile.ts <input.c>
 *
 * Reads a .c file, compiles it, and writes the .asm output
 * to the same directory with the same base name.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { compile } from '../vm/compiler.js';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stdout.write('Usage: compile <input.c>\n');
    process.exit(1);
  }

  const inputPath = resolve(args[0]);
  const dir = dirname(inputPath);
  const base = basename(inputPath, '.c');
  const outputPath = join(dir, `${base}.asm`);

  let source: string;
  try {
    source = readFileSync(inputPath, 'utf-8');
  } catch {
    process.stdout.write(`Error: cannot read file '${inputPath}'\n`);
    process.exit(1);
  }

  const result = compile(source);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      process.stdout.write(`Error: ${err}\n`);
    }
    process.exit(1);
  }

  writeFileSync(outputPath, result.assembly + '\n', 'utf-8');
  process.stdout.write(`Compiled: ${inputPath} -> ${outputPath}\n`);
}

main();
