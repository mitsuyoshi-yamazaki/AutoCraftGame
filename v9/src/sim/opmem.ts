/**
 * 操作メモリ（opmem）レイアウト定数。仕様: docs/specs/03_program_io.md
 */

import type { ComponentType } from './types';

// === 結果コード ===
export const RESULT_NONE = 0;
export const RESULT_SUCCESS = 1;
export const RESULT_NO_MATERIAL = 2;
export const RESULT_NO_ENERGY = 3;
export const RESULT_UNREACHABLE = 4;
export const RESULT_NO_CAPACITY = 5;
export const RESULT_EDGE_OCCUPIED = 6;
export const RESULT_INVALID = 7;

// === Processor（サイズ38） ===
export const PROC_OFF_RUN_FLAG = 0;
export const PROC_OFF_CSCAN_TRIGGER = 1;
export const PROC_OFF_CSCAN_FILTER = 2;
export const PROC_OFF_CSCAN_COUNT = 3;
export const PROC_OFF_CSCAN_RESULTS = 4; // 4..35
export const PROC_OFF_DISCONNECT_TRIGGER = 36;
export const PROC_OFF_DISCONNECT_TARGET = 37;
export const PROCESSOR_OPMEM_SIZE = 38;

export const SCAN_ENTRY_WORDS = 4;

// === Assembler（サイズ10） ===
export const ASM_OFF_ACTION_TRIGGER = 0; // 1=SET_RECIPE, 2=CRAFT, 3=ASSEMBLE, 4=REPAIR
export const ASM_OFF_RECIPE_CODE = 1;
export const ASM_OFF_CONNECTION_TARGET = 2;
export const ASM_OFF_CONNECTION_EDGE = 3; // 0-5, 0xFF=AUTO
export const ASM_OFF_REPAIR_TARGET = 4;
export const ASM_OFF_STATUS = 5;
export const ASM_OFF_PROGRESS = 6;
export const ASM_OFF_RESULT = 7;
export const ASM_OFF_CONFIGURED_RECIPE = 8;
export const ASM_OFF_LAST_PRODUCT = 9;
export const ASSEMBLER_OPMEM_SIZE = 10;

export const ASM_TRIGGER_SET_RECIPE = 1;
export const ASM_TRIGGER_CRAFT = 2;
export const ASM_TRIGGER_ASSEMBLE = 3;
export const ASM_TRIGGER_REPAIR = 4;
export const EDGE_AUTO = 0xff;

// === Harvester（サイズ5） ===
export const HARV_OFF_TRIGGER = 0;
export const HARV_OFF_FILTER = 1; // 0=全種, 20=エネルギー, 100+n=特定物質
export const HARV_OFF_RESULT = 2;
export const HARV_OFF_LAST_TYPE = 3;
export const HARV_OFF_LAST_AMOUNT = 4;
export const HARVESTER_OPMEM_SIZE = 5;

// === Disassembler（サイズ5） ===
export const DIS_OFF_TRIGGER = 0;
export const DIS_OFF_TARGET = 1;
export const DIS_OFF_STATUS = 2;
export const DIS_OFF_PROGRESS = 3;
export const DIS_OFF_RESULT = 4;
export const DISASSEMBLER_OPMEM_SIZE = 5;

// === Actuator（サイズ3） ===
export const ACT_OFF_DIRECTION = 0; // 0-255 = 0-2π
export const ACT_OFF_MAGNITUDE = 1;
export const ACT_OFF_STATUS = 2; // 0=停止, 1=作動, 3=エネルギー不足
export const ACTUATOR_OPMEM_SIZE = 3;

// === Sensor（サイズ35） ===
export const SENS_OFF_TRIGGER = 0;
export const SENS_OFF_FILTER = 1; // 0=全種, 1-8=コンポーネント種別, 9=物質, 10=エネルギー
export const SENS_OFF_COUNT = 2;
export const SENS_OFF_RESULTS = 3; // 3..34
export const SENSOR_OPMEM_SIZE = 35;

// === Storage（サイズ9） ===
export const STOR_OFF_TRANSFER_TRIGGER = 0;
export const STOR_OFF_TARGET = 1;
export const STOR_OFF_SUBSTANCE_CODE = 2; // 0=エネルギー
export const STOR_OFF_AMOUNT = 3;
export const STOR_OFF_RESULT = 4;
export const STOR_OFF_STORED_ENERGY = 5;
export const STOR_OFF_STORED_ATOMS = 6;
export const STOR_OFF_QUERY_CODE = 7;
export const STOR_OFF_QUERY_COUNT = 8;
export const STORAGE_OPMEM_SIZE = 9;

// === MemoryCore（サイズ1） ===
export const MEMCORE_OPMEM_SIZE = 1;

export const OPMEM_SIZE_BY_TYPE: Readonly<Record<ComponentType, number>> = {
  Assembler: ASSEMBLER_OPMEM_SIZE,
  Processor: PROCESSOR_OPMEM_SIZE,
  MemoryCore: MEMCORE_OPMEM_SIZE,
  Actuator: ACTUATOR_OPMEM_SIZE,
  Sensor: SENSOR_OPMEM_SIZE,
  Harvester: HARVESTER_OPMEM_SIZE,
  Disassembler: DISASSEMBLER_OPMEM_SIZE,
  Storage: STORAGE_OPMEM_SIZE,
};
