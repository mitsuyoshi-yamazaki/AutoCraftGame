import { compile } from '../src/vm/compiler.js';
const source = process.argv[2] ? require('fs').readFileSync(process.argv[2], 'utf-8') : `
int result = 0;
void main(void) {
  for (int i = 0; i < 3; i++) {
    int temp = i * 2;
    result = result + temp;
    continue;
  }
  halt();
}
`;
const r = compile(source);
if (r.errors.length > 0) { console.error(r.errors); process.exit(1); }
console.log(r.assembly);
