import { compile } from '../src/vm/compiler.js';
import { assemble } from '../src/vm/assembler.js';
import { createVm, loadProgram, executeOneTick } from '../src/vm/vm.js';
import type { VmState } from '../src/types.js';

const source = `
int phase = 0;
int counter = 0;
void main(void) {
  while (1) {
    int energy = counter;
    counter = counter + 1;
    if (counter > 100) {
      phase = 1;
      break;
    }
    halt();
    continue;
  }
}
`;

const compiled = compile(source);
if (compiled.errors.length > 0) { console.error(compiled.errors); process.exit(1); }
console.log('=== Assembly ===');
console.log(compiled.assembly);

const assembled = assemble(compiled.assembly);
if (assembled.errors.length > 0) { console.error(assembled.errors); process.exit(1); }

console.log('\n=== Labels ===');
for (const [k, v] of assembled.labels) console.log(`  ${k}: ${v}`);

let vm: VmState = { ...createVm(64), memory: [...createVm(64).memory] };
const loaded = loadProgram(vm, assembled.words);
vm = { ...vm, memory: [...loaded.memory], pc: loaded.pc, registers: [...loaded.registers], active: true, localIdTable: vm.localIdTable, localIdCounter: vm.localIdCounter };

const ioRead = () => 0;
const ioWrite = () => {};

console.log('\n=== Execution (tick by tick) ===');
for (let t = 0; t < 5; t++) {
  const before_sp = vm.registers[7];
  const before_pc = vm.pc;
  const result = executeOneTick(vm, ioRead, ioWrite, 100000);
  vm = result;
  console.log(`tick ${t}: pc ${before_pc}->${vm.pc} sp ${before_sp}->${vm.registers[7]} r1=${vm.registers[1]} mem[1]=${vm.memory[1]}`);
}
console.log('\nFinal mem[1] (result):', vm.memory[1]);
