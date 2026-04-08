/**
 * Built-in game API functions for Mini-C.
 * Each built-in expands to inline assembly (IN/OUT sequences).
 *
 * Strategy: codegen pushes all arguments onto the stack (right to left).
 * The emit function generates code that pops args from the stack one at a
 * time and writes them to I/O ports using r1 (value) and r2 (address).
 * This avoids register conflicts even with 6 arguments.
 *
 * I/O addresses follow the VM spec layout.
 */

// ---------------------------------------------------------------------------
// I/O Address constants
// ---------------------------------------------------------------------------

// Global (read-only)
const IO_ENERGY      = 0x0000;
const IO_DURABILITY  = 0x0001;
const IO_POS_X       = 0x0002;
const IO_POS_Y       = 0x0003;
const IO_VEL_X       = 0x0004;
const IO_VEL_Y       = 0x0005;
const IO_TICK        = 0x0006;

// Actuator[0] — base 0x1000
const ACT0_CMD       = 0x1001;
const ACT0_DIR       = 0x1002;

// Harvester[0] — base 0x2000
const HAR0_CMD       = 0x2001;
const HAR0_TARGET    = 0x2002;

// Charger[0] — base 0x3000
const CHR0_CMD       = 0x3001;
const CHR0_TARGET    = 0x3002;

// Assembler[0] — base 0x4000
const ASM0_CMD       = 0x4001;
const ASM0_ARG0      = 0x4002;  // frame_count / recipe / component_type
const ASM0_ARG1      = 0x4003;  // actuator_count
const ASM0_ARG2      = 0x4004;  // harvester_count
const ASM0_ARG3      = 0x4005;  // charger_count
const ASM0_ARG4      = 0x4006;  // assembler_count
const ASM0_ARG5      = 0x4007;  // processor_count
const ASM0_ARG6      = 0x4008;  // sensor_count
const ASM0_ARG7      = 0x4009;  // disassembler_count
const ASM0_ARG8      = 0x400A;  // memorycore_count
const ASM0_RESULT    = 0x4002;  // child_local_id (after ASSEMBLE cmd)

// Processor[0] — base 0x5000
const PRC0_CMD       = 0x5001;
const PRC0_TARGET    = 0x5002;
const PRC0_SRC       = 0x5003;
const PRC0_DST       = 0x5004;
const PRC0_LEN       = 0x5005;

// Sensor[0] — base 0x6000
const SEN0_CMD       = 0x6001;
const SEN0_FILTER    = 0x6002;  // filter (write) / local_id (write, cmd=2)
const SEN0_COUNT     = 0x6002;  // result after SENSE (cmd=1)
const SEN0_INDEX     = 0x6003;
const SEN0_TYPE      = 0x6004;
const SEN0_ANGLE     = 0x6005;
const SEN0_DIST      = 0x6006;
const SEN0_REG_CMD   = 0x6007;
const SEN0_REG_ID    = 0x6008;
const SEN0_AMOUNT    = 0x6009;

// Disassembler[0] — base 0x7000
const DIS0_CMD       = 0x7001;
const DIS0_TARGET    = 0x7002;

// Component discovery
const COMP_DISC_BASE = 0x0010;

// Inventory query
const INVENTORY_TYPE   = 0x0020;
const INVENTORY_CMD    = 0x0021;
const INVENTORY_RESULT = 0x0022;

// Query — base 0xA000
const QRY_TARGET     = 0xA000;
const QRY_CMD        = 0xA001;
const QRY_VALID      = 0xA002;
const QRY_TYPE       = 0xA003;  // property base (PROP_TYPE=0 reads here)

// ID release
const ID_RELEASE     = 0xA010;

// ---------------------------------------------------------------------------
// Built-in function definitions
// ---------------------------------------------------------------------------

export interface BuiltinDef {
  readonly name: string;
  readonly argCount: number;
  readonly returnsValue: boolean;
  /**
   * Generate assembly lines.
   * Args are on the stack: arg0 at top, arg1 below, etc.
   * Use POP r1 to get next arg. Use r1/r2 for work.
   * Result (if any) should end up in r1.
   * Returns [lines, popCount] — how many POPs were emitted.
   */
  readonly emit: () => { lines: string[]; pops: number };
}

// Helpers for generating assembly snippets

/** OUT an I/O address with a value from register */
const out = (addr: number, valReg: string): string[] => [
  `    LI r2, ${addr}`,
  `    OUT r2, ${valReg}`,
];

/** IN from an I/O address to register */
const inp = (destReg: string, addr: number): string[] => [
  `    LI r2, ${addr}`,
  `    IN ${destReg}, r2`,
];

/** POP next arg into r1, then OUT to addr */
const popOut = (addr: number): string[] => [
  '    POP r1',
  ...out(addr, 'r1'),
];

/** Load immediate into r1, then OUT to addr */
const constOut = (addr: number, val: number): string[] => [
  `    LI r1, ${val}`,
  ...out(addr, 'r1'),
];

export const BUILTINS: readonly BuiltinDef[] = [
  // --- Environment info (0 args, return value) ---
  { name: 'my_energy', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_ENERGY), pops: 0 }) },
  { name: 'my_durability', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_DURABILITY), pops: 0 }) },
  { name: 'my_x', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_POS_X), pops: 0 }) },
  { name: 'my_y', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_POS_Y), pops: 0 }) },
  { name: 'my_vx', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_VEL_X), pops: 0 }) },
  { name: 'my_vy', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_VEL_Y), pops: 0 }) },
  { name: 'current_tick', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', IO_TICK), pops: 0 }) },

  // --- move(direction) ---
  { name: 'move', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(ACT0_DIR),              // direction
      ...constOut(ACT0_CMD, 1),         // cmd = MOVE
    ], pops: 1 }) },

  // --- harvest() ---
  { name: 'harvest', argCount: 0, returnsValue: false,
    emit: () => ({ lines: constOut(HAR0_CMD, 1), pops: 0 }) },

  // --- harvest_target(local_id) ---
  { name: 'harvest_target', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(HAR0_TARGET),             // target local_id
      ...constOut(HAR0_CMD, 1),           // cmd = HARVEST
    ], pops: 1 }) },

  // --- recharge() ---
  { name: 'recharge', argCount: 0, returnsValue: false,
    emit: () => ({ lines: constOut(CHR0_CMD, 1), pops: 0 }) },

  // --- recharge_target(local_id) ---
  { name: 'recharge_target', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(CHR0_TARGET),             // target local_id
      ...constOut(CHR0_CMD, 1),           // cmd = RECHARGE
    ], pops: 1 }) },

  // --- process(recipe) ---
  { name: 'process', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(ASM0_ARG0),             // recipe
      ...constOut(ASM0_CMD, 1),         // cmd = PROCESS
    ], pops: 1 }) },

  // --- craft(component_type) ---
  { name: 'craft', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(ASM0_ARG0),             // component_type
      ...constOut(ASM0_CMD, 2),         // cmd = CRAFT
    ], pops: 1 }) },

  // --- assemble(frame, actuator, harvester, charger, assembler, processor) ---
  { name: 'assemble', argCount: 6, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(ASM0_ARG0),             // frame
      ...popOut(ASM0_ARG1),             // actuator
      ...popOut(ASM0_ARG2),             // harvester
      ...popOut(ASM0_ARG3),             // charger
      ...popOut(ASM0_ARG4),             // assembler
      ...popOut(ASM0_ARG5),             // processor
      ...constOut(ASM0_CMD, 3),         // cmd = ASSEMBLE
      ...inp('r1', ASM0_RESULT),        // child_local_id
    ], pops: 6 }) },

  // --- assemble_ext(sensor, disassembler, memorycore) ---
  { name: 'assemble_ext', argCount: 3, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(ASM0_ARG6),             // sensor
      ...popOut(ASM0_ARG7),             // disassembler
      ...popOut(ASM0_ARG8),             // memorycore
    ], pops: 3 }) },

  // --- write_memory(target_id, src_addr, dst_addr, length) ---
  { name: 'write_memory', argCount: 4, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(PRC0_TARGET),           // target_id
      ...popOut(PRC0_SRC),              // src_addr
      ...popOut(PRC0_DST),              // dst_addr
      ...popOut(PRC0_LEN),              // length
      ...constOut(PRC0_CMD, 1),         // cmd = WRITE
    ], pops: 4 }) },

  // --- activate(target_id) ---
  { name: 'activate', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(PRC0_TARGET),           // target_id
      ...constOut(PRC0_CMD, 2),         // cmd = ACTIVATE
    ], pops: 1 }) },

  // --- repair() ---
  { name: 'repair', argCount: 0, returnsValue: false,
    emit: () => ({ lines: constOut(ASM0_CMD, 4), pops: 0 }) },

  // --- disassemble(target_id) ---
  { name: 'disassemble', argCount: 1, returnsValue: false,
    emit: () => ({ lines: [
      ...popOut(DIS0_TARGET),           // target_id
      ...constOut(DIS0_CMD, 1),         // cmd = DISASSEMBLE
    ], pops: 1 }) },

  // --- sense(filter) ---
  { name: 'sense', argCount: 1, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(SEN0_FILTER),           // filter
      ...constOut(SEN0_CMD, 1),         // cmd = SENSE (immediate)
      ...inp('r1', SEN0_COUNT),         // result count
    ], pops: 1 }) },

  // --- sense_select(index) ---
  { name: 'sense_select', argCount: 1, returnsValue: false,
    emit: () => ({ lines: popOut(SEN0_INDEX), pops: 1 }) },

  // --- sense_type() ---
  { name: 'sense_type', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', SEN0_TYPE), pops: 0 }) },

  // --- sense_angle() ---
  { name: 'sense_angle', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', SEN0_ANGLE), pops: 0 }) },

  // --- sense_distance() ---
  { name: 'sense_distance', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', SEN0_DIST), pops: 0 }) },

  // --- sense_register() ---
  { name: 'sense_register', argCount: 0, returnsValue: true,
    emit: () => ({ lines: [
      ...constOut(SEN0_REG_CMD, 1),     // register command
      ...inp('r1', SEN0_REG_ID),        // registered local ID
    ], pops: 0 }) },

  // --- sense_amount() ---
  { name: 'sense_amount', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', SEN0_AMOUNT), pops: 0 }) },

  // --- sense_id(local_id) ---
  { name: 'sense_id', argCount: 1, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(SEN0_FILTER),           // local_id (written to +0x02)
      ...constOut(SEN0_CMD, 2),         // cmd = ID SENSE (immediate)
      ...inp('r1', SEN0_TYPE),          // result: entry_type (0=not found)
    ], pops: 1 }) },

  // --- query(local_id, property) ---
  { name: 'query', argCount: 2, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(QRY_TARGET),            // local_id
      '    POP r3',                     // property index (save for later)
      ...constOut(QRY_CMD, 1),          // trigger query
      // Read from QRY_TYPE + property offset
      `    LI r2, ${QRY_TYPE}`,
      '    ADD r2, r2, r3',             // r2 = QRY_TYPE + property
      '    IN r1, r2',                  // read result
    ], pops: 2 }) },

  // --- query_valid() ---
  { name: 'query_valid', argCount: 0, returnsValue: true,
    emit: () => ({ lines: inp('r1', QRY_VALID), pops: 0 }) },

  // --- release_id(local_id) ---
  { name: 'release_id', argCount: 1, returnsValue: false,
    emit: () => ({ lines: popOut(ID_RELEASE), pops: 1 }) },

  // --- component_count(type) ---
  { name: 'component_count', argCount: 1, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(COMP_DISC_BASE),
      ...constOut(COMP_DISC_BASE + 1, 1),
      ...inp('r1', COMP_DISC_BASE + 2),
    ], pops: 1 }) },

  // --- component_total(type) ---
  { name: 'component_total', argCount: 1, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(COMP_DISC_BASE),
      ...constOut(COMP_DISC_BASE + 1, 2),
      ...inp('r1', COMP_DISC_BASE + 2),
    ], pops: 1 }) },

  // --- component_status(type, index) ---
  { name: 'component_status', argCount: 2, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(COMP_DISC_BASE),
      ...popOut(COMP_DISC_BASE + 3),
      ...constOut(COMP_DISC_BASE + 1, 3),
      ...inp('r1', COMP_DISC_BASE + 2),
    ], pops: 2 }) },

  // --- inventory_count(item_type) ---
  { name: 'inventory_count', argCount: 1, returnsValue: true,
    emit: () => ({ lines: [
      ...popOut(INVENTORY_TYPE),            // item_type
      ...constOut(INVENTORY_CMD, 1),        // cmd = 1 (query count)
      ...inp('r1', INVENTORY_RESULT),       // read result
    ], pops: 1 }) },

  // --- halt() ---
  { name: 'halt', argCount: 0, returnsValue: false,
    emit: () => ({ lines: ['    HALT'], pops: 0 }) },

  // --- checkpoint() ---
  // Emits CHECKPOINT instruction. The VM updates cp = PC+1 and cpSet = true.
  // At tick start, if cpSet is true, PC is reset to cp. This guarantees that
  // execution resumes from the most recently executed checkpoint() call.
  { name: 'checkpoint', argCount: 0, returnsValue: false,
    emit: () => ({ lines: ['    CHECKPOINT'], pops: 0 }) },
];

/** Map for quick lookup */
export const BUILTIN_MAP: ReadonlyMap<string, BuiltinDef> = new Map(
  BUILTINS.map(b => [b.name, b])
);
