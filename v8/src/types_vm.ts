/**
 * VmState type — bridge between v7's ProcessorObject and the v5/v6 VM executor.
 * The VM executor expects this interface.
 */
export interface VmState {
  readonly memory: readonly number[];
  readonly registers: readonly number[];
  readonly pc: number;
  readonly cp: number;        // unused in v7 (CHECKPOINT removed)
  readonly cpSet: boolean;    // unused in v7
  readonly active: boolean;
  readonly localIdTable: ReadonlyMap<number, number>;
  readonly localIdCounter: number;
}
