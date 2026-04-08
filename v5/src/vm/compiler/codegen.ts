/**
 * Code generator for Mini-C.
 * Walks the AST and emits v4 assembly text.
 *
 * Register allocation strategy (simple, stack-based):
 * - r1: primary expression result / return value
 * - r2: secondary operand
 * - r3: scratch for address calculations
 * - r4: scratch for I/O addresses in builtins
 * - r5: scratch for call targets
 * - r6: return address (saved/restored around calls)
 * - r7: stack pointer (grows downward)
 *
 * Calling convention:
 * - Arguments: r1-r6
 * - Return value: r1
 * - Caller saves all registers it needs
 * - JALR r6, target for calls; r6 holds return address
 *
 * Stack depth tracking:
 * - stackDepth tracks total items pushed on stack (locals + temporaries)
 * - Each local records its stackDepth at time of allocation
 * - Variable access: offset = stackDepth - local.depth - 1
 */

import type {
  Program, FuncDecl, GlobalVarDecl,
  Stmt, Expr, VarDecl, CType,
} from './ast.js';
import { BUILTIN_MAP } from './builtins.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GlobalInfo {
  readonly name: string;
  readonly label: string;
}

interface LocalInfo {
  readonly name: string;
  readonly depth: number;  // stackDepth at allocation time
}

interface FuncInfo {
  readonly name: string;
  readonly label: string;
  readonly paramCount: number;
  readonly returnType: CType;
}

interface Ctx {
  readonly globals: Map<string, GlobalInfo>;
  readonly functions: Map<string, FuncInfo>;
  locals: LocalInfo[];
  stackDepth: number;      // total items on stack (locals + temps)
  localVarCount: number;   // count of local variables (for epilogue cleanup)
  labelCounter: number;
  currentFunc: FuncInfo | null;
  breakLabel: string | null;
  breakStackDepth: number;      // stackDepth at break target
  continueLabel: string | null;
  continueStackDepth: number;   // stackDepth at continue target
  lines: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generate(program: Program): string {
  const ctx: Ctx = {
    globals: new Map(),
    functions: new Map(),
    locals: [],
    stackDepth: 0,
    localVarCount: 0,
    labelCounter: 0,
    currentFunc: null,
    breakLabel: null,
    breakStackDepth: 0,
    continueLabel: null,
    continueStackDepth: 0,
    lines: [],
  };

  collectDeclarations(program, ctx);
  emit(ctx, '    JMP _main');
  emitGlobals(program, ctx);

  for (const decl of program.declarations) {
    if (decl.kind === 'func_decl') emitFunction(decl, ctx);
  }

  return ctx.lines.join('\n');
}

// ---------------------------------------------------------------------------
// Declaration collection
// ---------------------------------------------------------------------------

function collectDeclarations(program: Program, ctx: Ctx): void {
  for (const decl of program.declarations) {
    if (decl.kind === 'func_decl') {
      ctx.functions.set(decl.name, {
        name: decl.name, label: `_${decl.name}`,
        paramCount: decl.params.length, returnType: decl.returnType,
      });
    } else if (decl.kind === 'global_var') {
      ctx.globals.set(decl.name, { name: decl.name, label: `_g_${decl.name}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Global variables
// ---------------------------------------------------------------------------

function emitGlobals(program: Program, ctx: Ctx): void {
  for (const d of program.declarations) {
    if (d.kind !== 'global_var') continue;
    const g = d as GlobalVarDecl;
    const info = ctx.globals.get(g.name)!;
    const initVal = g.init && g.init.kind === 'number' ? g.init.value : 0;
    emit(ctx, `${info.label}:`);
    emit(ctx, `    .word ${initVal}`);
  }
}

// ---------------------------------------------------------------------------
// Function emission
// ---------------------------------------------------------------------------

function emitFunction(func: FuncDecl, ctx: Ctx): void {
  const info = ctx.functions.get(func.name)!;
  ctx.currentFunc = info;
  ctx.locals = [];
  ctx.stackDepth = 0;
  ctx.localVarCount = 0;

  emit(ctx, `${info.label}:`);

  // Prologue: save return address
  emitPush(ctx, 'r6');

  // Push parameters onto stack as locals
  for (let i = 0; i < func.params.length; i++) {
    emitPush(ctx, `r${i + 1}`);
    ctx.locals.push({ name: func.params[i].name, depth: ctx.stackDepth - 1 });
    ctx.localVarCount++;
  }

  // Emit body
  for (const stmt of func.body) emitStmt(stmt, ctx);

  // Epilogue
  emit(ctx, `_${func.name}_epilogue:`);
  // Pop locals (localVarCount items)
  if (ctx.localVarCount > 0) {
    emitAddImm(ctx, 'r7', 'r7', ctx.localVarCount);
    ctx.stackDepth -= ctx.localVarCount;
  }
  emitPop(ctx, 'r6');
  emit(ctx, '    JALR r0, r6');
}

// ---------------------------------------------------------------------------
// Statement emission
// ---------------------------------------------------------------------------

function emitStmt(stmt: Stmt, ctx: Ctx): void {
  switch (stmt.kind) {
    case 'var_decl': emitVarDecl(stmt, ctx); break;
    case 'expr_stmt': emitExpr(stmt.expr, ctx); break;
    case 'return': emitReturn(stmt, ctx); break;
    case 'if': emitIf(stmt, ctx); break;
    case 'while': emitWhile(stmt, ctx); break;
    case 'for': emitFor(stmt, ctx); break;
    case 'break': emitBreak(ctx); break;
    case 'continue': emitContinue(ctx); break;
    case 'block': for (const s of stmt.body) emitStmt(s, ctx); break;
  }
}

function emitBreak(ctx: Ctx): void {
  if (!ctx.breakLabel) return;
  const unwind = ctx.stackDepth - ctx.breakStackDepth;
  if (unwind > 0) {
    emitAddImm(ctx, 'r7', 'r7', unwind);
  }
  emit(ctx, `    JMP ${ctx.breakLabel}`);
}

function emitContinue(ctx: Ctx): void {
  if (!ctx.continueLabel) return;
  const unwind = ctx.stackDepth - ctx.continueStackDepth;
  if (unwind > 0) {
    emitAddImm(ctx, 'r7', 'r7', unwind);
  }
  emit(ctx, `    JMP ${ctx.continueLabel}`);
}

function emitVarDecl(decl: VarDecl, ctx: Ctx): void {
  if (decl.init) {
    emitExpr(decl.init, ctx);
    emitPush(ctx, 'r1');
  } else {
    emitPush(ctx, 'r0');
  }
  ctx.locals.push({ name: decl.name, depth: ctx.stackDepth - 1 });
  ctx.localVarCount++;
}

function emitReturn(stmt: { readonly value: Expr | null }, ctx: Ctx): void {
  if (stmt.value) emitExpr(stmt.value, ctx);
  // Unwind current locals (stackDepth - 1 items; the 1 is the saved r6)
  const localsOnStack = ctx.stackDepth - 1;
  if (localsOnStack > 0) {
    emitAddImm(ctx, 'r7', 'r7', localsOnStack);
  }
  emit(ctx, '    POP r6');
  emit(ctx, '    JALR r0, r6');
}

function emitIf(
  stmt: { readonly condition: Expr; readonly thenBody: Stmt[]; readonly elseBody: Stmt[] | null },
  ctx: Ctx,
): void {
  const elseLabel = newLabel(ctx);
  const endLabel = newLabel(ctx);

  const savedStackDepth = ctx.stackDepth;
  const savedLocals = [...ctx.locals];
  const savedLocalVarCount = ctx.localVarCount;

  emitExpr(stmt.condition, ctx);
  emit(ctx, `    BEQL r1, r0, ${elseLabel}`);

  for (const s of stmt.thenBody) emitStmt(s, ctx);

  // Cleanup then-branch locals
  const thenNewVars = ctx.stackDepth - savedStackDepth;
  if (thenNewVars > 0) {
    emitAddImm(ctx, 'r7', 'r7', thenNewVars);
  }
  ctx.stackDepth = savedStackDepth;
  ctx.localVarCount = savedLocalVarCount;
  ctx.locals = [...savedLocals];

  if (stmt.elseBody) {
    emit(ctx, `    JMP ${endLabel}`);
    emit(ctx, `${elseLabel}:`);
    for (const s of stmt.elseBody) emitStmt(s, ctx);

    // Cleanup else-branch locals
    const elseNewVars = ctx.stackDepth - savedStackDepth;
    if (elseNewVars > 0) {
      emitAddImm(ctx, 'r7', 'r7', elseNewVars);
    }
    ctx.stackDepth = savedStackDepth;
    ctx.localVarCount = savedLocalVarCount;
    ctx.locals = [...savedLocals];

    emit(ctx, `${endLabel}:`);
  } else {
    emit(ctx, `${elseLabel}:`);
  }
}

function emitWhile(
  stmt: { readonly condition: Expr; readonly body: Stmt[] },
  ctx: Ctx,
): void {
  const loopStart = newLabel(ctx);
  const loopEnd = newLabel(ctx);
  const savedBreak = ctx.breakLabel;
  const savedBreakDepth = ctx.breakStackDepth;
  const savedContinue = ctx.continueLabel;
  const savedContinueDepth = ctx.continueStackDepth;
  const loopStackDepth = ctx.stackDepth;
  ctx.breakLabel = loopEnd;
  ctx.breakStackDepth = loopStackDepth;
  ctx.continueLabel = loopStart;
  ctx.continueStackDepth = loopStackDepth;

  const bodyStartLocals = [...ctx.locals];
  const bodyStartLocalVarCount = ctx.localVarCount;

  emit(ctx, `${loopStart}:`);
  emitExpr(stmt.condition, ctx);
  emit(ctx, `    BEQL r1, r0, ${loopEnd}`);

  for (const s of stmt.body) emitStmt(s, ctx);

  // Deallocate body-local variables at end of iteration (normal fallthrough path)
  const bodyNewVars = ctx.localVarCount - bodyStartLocalVarCount;
  if (bodyNewVars > 0) {
    emitAddImm(ctx, 'r7', 'r7', bodyNewVars);
  }
  // Reset ctx to loop-start state regardless of body declarations
  ctx.stackDepth = loopStackDepth;
  ctx.localVarCount = bodyStartLocalVarCount;
  ctx.locals = [...bodyStartLocals];

  emit(ctx, `    JMP ${loopStart}`);
  emit(ctx, `${loopEnd}:`);

  ctx.breakLabel = savedBreak;
  ctx.breakStackDepth = savedBreakDepth;
  ctx.continueLabel = savedContinue;
  ctx.continueStackDepth = savedContinueDepth;
}

function emitFor(
  stmt: {
    readonly init: VarDecl | { kind: 'expr_stmt'; expr: Expr } | null;
    readonly condition: Expr | null;
    readonly update: Expr | null;
    readonly body: Stmt[];
  },
  ctx: Ctx,
): void {
  const loopStart = newLabel(ctx);
  const loopEnd = newLabel(ctx);
  const loopContinue = newLabel(ctx);
  const savedBreak = ctx.breakLabel;
  const savedBreakDepth = ctx.breakStackDepth;
  const savedContinue = ctx.continueLabel;
  const savedContinueDepth = ctx.continueStackDepth;

  const savedLocalVarCount = ctx.localVarCount;
  const savedLocals = [...ctx.locals];

  if (stmt.init) {
    if (stmt.init.kind === 'var_decl') emitVarDecl(stmt.init as VarDecl, ctx);
    else emitExpr(stmt.init.expr, ctx);
  }

  // Both break and continue target the same stackDepth (after init vars allocated).
  // The for-epilogue at loopEnd handles deallocating init vars separately.
  const loopBodyStackDepth = ctx.stackDepth;
  ctx.breakLabel = loopEnd;
  ctx.breakStackDepth = loopBodyStackDepth;  // break unwinds body locals only; epilogue handles init vars
  ctx.continueLabel = loopContinue;
  ctx.continueStackDepth = loopBodyStackDepth;  // continue keeps init vars

  emit(ctx, `${loopStart}:`);
  if (stmt.condition) {
    emitExpr(stmt.condition, ctx);
    emit(ctx, `    BEQL r1, r0, ${loopEnd}`);
  }

  const bodyStartLocals = [...ctx.locals];
  const bodyStartLocalVarCount = ctx.localVarCount;

  for (const s of stmt.body) emitStmt(s, ctx);

  // Deallocate body-local variables at end of iteration (normal fallthrough path)
  const bodyNewVars = ctx.localVarCount - bodyStartLocalVarCount;
  if (bodyNewVars > 0) {
    emitAddImm(ctx, 'r7', 'r7', bodyNewVars);
  }
  // Reset ctx to loop-body-start state regardless of body declarations
  ctx.stackDepth = loopBodyStackDepth;
  ctx.localVarCount = bodyStartLocalVarCount;
  ctx.locals = [...bodyStartLocals];

  emit(ctx, `${loopContinue}:`);
  if (stmt.update) emitExpr(stmt.update, ctx);
  emit(ctx, `    JMP ${loopStart}`);
  emit(ctx, `${loopEnd}:`);

  // Deallocate for-init locals
  const newVars = ctx.localVarCount - savedLocalVarCount;
  if (newVars > 0) {
    emitAddImm(ctx, 'r7', 'r7', newVars);
    ctx.stackDepth -= newVars;
    ctx.localVarCount = savedLocalVarCount;
    ctx.locals = savedLocals;
  }

  ctx.breakLabel = savedBreak;
  ctx.breakStackDepth = savedBreakDepth;
  ctx.continueLabel = savedContinue;
  ctx.continueStackDepth = savedContinueDepth;
}

// ---------------------------------------------------------------------------
// Expression emission — result always in r1
// ---------------------------------------------------------------------------

function emitExpr(expr: Expr, ctx: Ctx): void {
  switch (expr.kind) {
    case 'number': emitLoadImm(ctx, 'r1', expr.value & 0xFFFF); break;
    case 'bool': emitLoadImm(ctx, 'r1', expr.value ? 1 : 0); break;
    case 'identifier': emitLoadVar(expr.name, 'r1', ctx); break;
    case 'binary': emitBinary(expr, ctx); break;
    case 'unary': emitUnary(expr, ctx); break;
    case 'assign': emitAssign(expr, ctx); break;
    case 'call': emitCall(expr, ctx); break;
    case 'comma': emitExpr(expr.left, ctx); emitExpr(expr.right, ctx); break;
  }
}

function emitBinary(
  expr: { readonly op: string; readonly left: Expr; readonly right: Expr },
  ctx: Ctx,
): void {
  // Short-circuit for && and ||
  if (expr.op === '&&') {
    const falseLabel = newLabel(ctx);
    const endLabel = newLabel(ctx);
    emitExpr(expr.left, ctx);
    emit(ctx, `    BEQL r1, r0, ${falseLabel}`);
    emitExpr(expr.right, ctx);
    emit(ctx, `    BNEL r1, r0, ${endLabel}`);
    emit(ctx, `${falseLabel}:`);
    emit(ctx, '    ADD r1, r0, r0');
    emit(ctx, `${endLabel}:`);
    return;
  }
  if (expr.op === '||') {
    const trueLabel = newLabel(ctx);
    const endLabel = newLabel(ctx);
    emitExpr(expr.left, ctx);
    emit(ctx, `    BNEL r1, r0, ${trueLabel}`);
    emitExpr(expr.right, ctx);
    emit(ctx, `    BEQL r1, r0, ${endLabel}`);
    emit(ctx, `${trueLabel}:`);
    emit(ctx, '    LI r1, 1');
    emit(ctx, `${endLabel}:`);
    return;
  }

  // Evaluate left, push, evaluate right, pop left into r2
  emitExpr(expr.left, ctx);
  emitPush(ctx, 'r1');
  emitExpr(expr.right, ctx);
  emit(ctx, '    MOV r2, r1');
  emitPop(ctx, 'r1');

  switch (expr.op) {
    case '+':  emit(ctx, '    ADD r1, r1, r2'); break;
    case '-':  emit(ctx, '    SUB r1, r1, r2'); break;
    case '*':  emit(ctx, '    MUL r1, r1, r2'); break;
    case '/':  emit(ctx, '    DIV r1, r1, r2'); break;
    case '%':  emit(ctx, '    MOD r1, r1, r2'); break;
    case '&':  emit(ctx, '    AND r1, r1, r2'); break;
    case '|':  emit(ctx, '    OR r1, r1, r2'); break;
    case '^':  emit(ctx, '    XOR r1, r1, r2'); break;
    case '<<': emit(ctx, '    SHL r1, r1, r2'); break;
    case '>>': emit(ctx, '    SHR r1, r1, r2'); break;
    case '==': emitCmp(ctx, 'BEQL'); break;
    case '!=': emitCmp(ctx, 'BNEL'); break;
    case '<':  emitCmp(ctx, 'BLTL'); break;
    case '>=': emitCmp(ctx, 'BGEL'); break;
    case '>':  // a > b = b < a
      emit(ctx, '    MOV r3, r1');
      emit(ctx, '    MOV r1, r2');
      emit(ctx, '    MOV r2, r3');
      emitCmp(ctx, 'BLTL');
      break;
    case '<=': // a <= b = b >= a
      emit(ctx, '    MOV r3, r1');
      emit(ctx, '    MOV r1, r2');
      emit(ctx, '    MOV r2, r3');
      emitCmp(ctx, 'BGEL');
      break;
  }
}

function emitCmp(ctx: Ctx, branchInstr: string): void {
  const trueLabel = newLabel(ctx);
  const endLabel = newLabel(ctx);
  emit(ctx, `    ${branchInstr} r1, r2, ${trueLabel}`);
  emit(ctx, '    ADD r1, r0, r0');
  emit(ctx, `    JMP ${endLabel}`);
  emit(ctx, `${trueLabel}:`);
  emit(ctx, '    LI r1, 1');
  emit(ctx, `${endLabel}:`);
}

function emitUnary(
  expr: { readonly op: string; readonly operand: Expr; readonly prefix: boolean },
  ctx: Ctx,
): void {
  if (expr.op === '!') {
    emitExpr(expr.operand, ctx);
    const trueLabel = newLabel(ctx);
    const endLabel = newLabel(ctx);
    emit(ctx, `    BEQL r1, r0, ${trueLabel}`);
    emit(ctx, '    ADD r1, r0, r0');
    emit(ctx, `    JMP ${endLabel}`);
    emit(ctx, `${trueLabel}:`);
    emit(ctx, '    LI r1, 1');
    emit(ctx, `${endLabel}:`);
    return;
  }
  if (expr.op === '~') {
    emitExpr(expr.operand, ctx);
    emit(ctx, '    LI r2, 65535');
    emit(ctx, '    XOR r1, r1, r2');
    return;
  }
  if (expr.op === '-') {
    emitExpr(expr.operand, ctx);
    emit(ctx, '    SUB r1, r0, r1');
    return;
  }
  if (expr.op === '++' || expr.op === '--') {
    if (expr.operand.kind !== 'identifier') return;
    const name = expr.operand.name;
    const delta = expr.op === '++' ? 1 : -1;
    emitLoadVar(name, 'r1', ctx);
    if (expr.prefix) {
      emit(ctx, `    ADDI r1, r1, ${delta}`);
      emitStoreVar(name, 'r1', ctx);
    } else {
      emit(ctx, '    MOV r2, r1');
      emit(ctx, `    ADDI r2, r2, ${delta}`);
      emitStoreVar(name, 'r2', ctx);
    }
  }
}

function emitAssign(
  expr: { readonly op: string; readonly target: { readonly name: string }; readonly value: Expr },
  ctx: Ctx,
): void {
  const name = expr.target.name;
  if (expr.op === '=') {
    emitExpr(expr.value, ctx);
    emitStoreVar(name, 'r1', ctx);
    return;
  }
  // Compound assignment
  emitLoadVar(name, 'r1', ctx);
  emitPush(ctx, 'r1');
  emitExpr(expr.value, ctx);
  emit(ctx, '    MOV r2, r1');
  emitPop(ctx, 'r1');
  const opMap: Record<string, string> = {
    '+=': 'ADD', '-=': 'SUB', '*=': 'MUL', '/=': 'DIV', '%=': 'MOD',
    '&=': 'AND', '|=': 'OR', '^=': 'XOR', '<<=': 'SHL', '>>=': 'SHR',
  };
  const instr = opMap[expr.op];
  if (instr) emit(ctx, `    ${instr} r1, r1, r2`);
  emitStoreVar(name, 'r1', ctx);
}

function emitCall(
  expr: { readonly name: string; readonly args: readonly Expr[] },
  ctx: Ctx,
): void {
  const builtin = BUILTIN_MAP.get(expr.name);
  if (builtin) {
    emitBuiltinCall(builtin, expr.args, ctx);
    return;
  }

  const funcInfo = ctx.functions.get(expr.name);
  if (!funcInfo) {
    emit(ctx, `    ; ERROR: undefined function '${expr.name}'`);
    return;
  }

  // Evaluate arguments right-to-left, push them as temporaries
  const argCount = expr.args.length;
  for (let i = argCount - 1; i >= 0; i--) {
    emitExpr(expr.args[i], ctx);
    emitPush(ctx, 'r1');
  }

  // Pop into argument registers r1..rN
  for (let i = 0; i < argCount; i++) {
    emitPop(ctx, `r${i + 1}`);
  }

  // Call function
  emit(ctx, `    LI r5, ${funcInfo.label}`);
  emit(ctx, '    JALR r6, r5');
  // Result is in r1
}

function emitBuiltinCall(
  builtin: {
    readonly argCount: number;
    readonly emit: () => { lines: string[]; pops: number };
  },
  args: readonly Expr[],
  ctx: Ctx,
): void {
  // Push args right-to-left so arg0 is at top of stack
  for (let i = args.length - 1; i >= 0; i--) {
    emitExpr(args[i], ctx);
    emitPush(ctx, 'r1');
  }

  // Emit the builtin's inline assembly (it pops args from stack)
  const result = builtin.emit();
  for (const line of result.lines) {
    if (line.includes('POP ')) ctx.stackDepth--;
    emit(ctx, line);
  }

  // Pop any remaining args that the builtin didn't consume
  const remaining = args.length - result.pops;
  if (remaining > 0) {
    emitAddImm(ctx, 'r7', 'r7', remaining);
    ctx.stackDepth -= remaining;
  }
}

// ---------------------------------------------------------------------------
// Variable access — uses stackDepth for correct offsets
// ---------------------------------------------------------------------------

function emitLoadVar(name: string, destReg: string, ctx: Ctx): void {
  // Search locals from innermost scope outward
  for (let i = ctx.locals.length - 1; i >= 0; i--) {
    if (ctx.locals[i].name === name) {
      const offset = ctx.stackDepth - 1 - ctx.locals[i].depth;
      emitStackLoad(ctx, destReg, offset);
      return;
    }
  }
  // Global variable
  const global = ctx.globals.get(name);
  if (global) {
    emit(ctx, `    LI r3, ${global.label}`);
    emit(ctx, `    LW ${destReg}, r3, 0`);
    return;
  }
  emit(ctx, `    ; ERROR: undefined variable '${name}'`);
  emit(ctx, `    ADD ${destReg}, r0, r0`);
}

function emitStoreVar(name: string, srcReg: string, ctx: Ctx): void {
  for (let i = ctx.locals.length - 1; i >= 0; i--) {
    if (ctx.locals[i].name === name) {
      const offset = ctx.stackDepth - 1 - ctx.locals[i].depth;
      emitStackStore(ctx, srcReg, offset);
      return;
    }
  }
  const global = ctx.globals.get(name);
  if (global) {
    emit(ctx, `    LI r3, ${global.label}`);
    emit(ctx, `    SW ${srcReg}, r3, 0`);
    return;
  }
  emit(ctx, `    ; ERROR: undefined variable '${name}'`);
}

function emitStackLoad(ctx: Ctx, destReg: string, offset: number): void {
  if (offset >= -8 && offset <= 7) {
    emit(ctx, `    LW ${destReg}, r7, ${offset}`);
  } else {
    emitAddImm(ctx, 'r3', 'r7', offset);
    emit(ctx, `    LW ${destReg}, r3, 0`);
  }
}

function emitStackStore(ctx: Ctx, srcReg: string, offset: number): void {
  if (offset >= -8 && offset <= 7) {
    emit(ctx, `    SW ${srcReg}, r7, ${offset}`);
  } else {
    emitAddImm(ctx, 'r3', 'r7', offset);
    emit(ctx, `    SW ${srcReg}, r3, 0`);
  }
}

// ---------------------------------------------------------------------------
// Stack helpers — track depth
// ---------------------------------------------------------------------------

function emitPush(ctx: Ctx, reg: string): void {
  emit(ctx, `    PUSH ${reg}`);
  ctx.stackDepth++;
}

function emitPop(ctx: Ctx, reg: string): void {
  emit(ctx, `    POP ${reg}`);
  ctx.stackDepth--;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function emit(ctx: Ctx, line: string): void {
  ctx.lines.push(line);
}

function newLabel(ctx: Ctx): string {
  return `_L${ctx.labelCounter++}`;
}

function emitLoadImm(ctx: Ctx, reg: string, value: number): void {
  if (value === 0) {
    emit(ctx, `    ADD ${reg}, r0, r0`);
  } else {
    emit(ctx, `    LI ${reg}, ${value}`);
  }
}

function emitAddImm(ctx: Ctx, dest: string, src: string, imm: number): void {
  if (imm === 0) {
    if (dest !== src) emit(ctx, `    MOV ${dest}, ${src}`);
    return;
  }
  if (imm >= -8 && imm <= 7) {
    emit(ctx, `    ADDI ${dest}, ${src}, ${imm}`);
  } else {
    emit(ctx, `    LI ${dest}, ${imm & 0xFFFF}`);
    emit(ctx, `    ADD ${dest}, ${src}, ${dest}`);
  }
}
