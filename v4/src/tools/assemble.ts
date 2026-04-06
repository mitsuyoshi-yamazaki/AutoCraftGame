/**
 * CLI entry point for the v4 assembler.
 *
 * Usage: npx tsx src/tools/assemble.ts <input.asm>
 *
 * Outputs:
 *   <input>.bin  — binary (Uint16Array, little-endian)
 *   <input>.json — JSON array of 16-bit word values
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assemble } from '../vm/assembler.js';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx src/tools/assemble.ts <input.asm>');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.log(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, 'utf-8');
  const result = assemble(source);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`ERROR: ${err}`);
    }
    console.log(`\nAssembly failed with ${result.errors.length} error(s).`);
    process.exit(1);
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));

  // Write .bin (Uint16Array, little-endian)
  const binPath = path.join(dir, `${base}.bin`);
  const buf = new Uint16Array(result.words);
  fs.writeFileSync(binPath, Buffer.from(buf.buffer));

  // Write .json (array of numbers)
  const jsonPath = path.join(dir, `${base}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result.words));

  // Summary
  console.log(`Assembled ${result.words.length} words`);
  console.log(`  ${binPath}`);
  console.log(`  ${jsonPath}`);

  if (result.labels.size > 0) {
    console.log(`\nLabels:`);
    for (const [name, addr] of result.labels) {
      console.log(`  ${name}: 0x${addr.toString(16).padStart(4, '0')}`);
    }
  }
}

main();
