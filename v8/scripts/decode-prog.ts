/** Decode the replicator program. */
import { generateReplicatorProgram } from '../src/programs.js';

const p = generateReplicatorProgram();
console.log('program length:', p.length);
for (let i = 0; i < p.length; i++) {
  console.log(`${i.toString().padStart(4)}: 0x${p[i].toString(16).padStart(4, '0')}`);
}
