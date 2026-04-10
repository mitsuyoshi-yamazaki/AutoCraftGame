/**
 * AST node types for Mini-C.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CType = 'int' | 'bool' | 'void';

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface NumberLiteral {
  readonly kind: 'number';
  readonly value: number;
}

export interface BoolLiteral {
  readonly kind: 'bool';
  readonly value: boolean;
}

export interface Identifier {
  readonly kind: 'identifier';
  readonly name: string;
}

export interface BinaryExpr {
  readonly kind: 'binary';
  readonly op: string;
  readonly left: Expr;
  readonly right: Expr;
}

export interface UnaryExpr {
  readonly kind: 'unary';
  readonly op: string;        // '!', '~', '-', '++', '--'
  readonly operand: Expr;
  readonly prefix: boolean;   // true=prefix, false=postfix
}

export interface AssignExpr {
  readonly kind: 'assign';
  readonly op: string;        // '=', '+=', '-=', etc.
  readonly target: Identifier;
  readonly value: Expr;
}

export interface CallExpr {
  readonly kind: 'call';
  readonly name: string;
  readonly args: readonly Expr[];
}

export interface CommaExpr {
  readonly kind: 'comma';
  readonly left: Expr;
  readonly right: Expr;
}

export type Expr =
  | NumberLiteral | BoolLiteral | Identifier
  | BinaryExpr | UnaryExpr | AssignExpr
  | CallExpr | CommaExpr;

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export interface VarDecl {
  readonly kind: 'var_decl';
  readonly type: CType;
  readonly name: string;
  readonly init: Expr | null;
}

export interface ExprStmt {
  readonly kind: 'expr_stmt';
  readonly expr: Expr;
}

export interface ReturnStmt {
  readonly kind: 'return';
  readonly value: Expr | null;
}

export interface IfStmt {
  readonly kind: 'if';
  readonly condition: Expr;
  readonly thenBody: Stmt[];
  readonly elseBody: Stmt[] | null;
}

export interface WhileStmt {
  readonly kind: 'while';
  readonly condition: Expr;
  readonly body: Stmt[];
}

export interface ForStmt {
  readonly kind: 'for';
  readonly init: VarDecl | ExprStmt | null;
  readonly condition: Expr | null;
  readonly update: Expr | null;
  readonly body: Stmt[];
}

export interface BreakStmt { readonly kind: 'break'; }
export interface ContinueStmt { readonly kind: 'continue'; }
export interface BlockStmt {
  readonly kind: 'block';
  readonly body: Stmt[];
}

export type Stmt =
  | VarDecl | ExprStmt | ReturnStmt
  | IfStmt | WhileStmt | ForStmt
  | BreakStmt | ContinueStmt | BlockStmt;

// ---------------------------------------------------------------------------
// Top-level declarations
// ---------------------------------------------------------------------------

export interface FuncDecl {
  readonly kind: 'func_decl';
  readonly returnType: CType;
  readonly name: string;
  readonly params: readonly { readonly type: CType; readonly name: string }[];
  readonly body: Stmt[];
}

export interface GlobalVarDecl {
  readonly kind: 'global_var';
  readonly type: CType;
  readonly name: string;
  readonly init: Expr | null;
}

export type TopLevel = FuncDecl | GlobalVarDecl;

export interface Program {
  readonly declarations: readonly TopLevel[];
}
