/**
 * Recursive descent parser for Mini-C.
 * Produces an AST from a token list.
 */

import type { Token, TokenType } from './lexer.js';
import type {
  CType, Expr, Stmt, TopLevel, Program,
  FuncDecl, GlobalVarDecl, VarDecl,
} from './ast.js';

// ---------------------------------------------------------------------------
// Parser state
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(message: string, readonly line: number, readonly col: number) {
    super(`[${line}:${col}] ${message}`);
  }
}

export function parse(tokens: readonly Token[]): Program {
  let pos = 0;

  // --- Token helpers ---
  const peek = (): Token => tokens[pos] ?? { type: 'EOF', value: '', line: 0, col: 0 };
  const advance = (): Token => tokens[pos++];
  const check = (type: TokenType, value?: string): boolean => {
    const t = peek();
    return t.type === type && (value === undefined || t.value === value);
  };
  const match = (type: TokenType, value?: string): boolean => {
    if (check(type, value)) { advance(); return true; }
    return false;
  };
  const expect = (type: TokenType, value?: string): Token => {
    const t = peek();
    if (t.type === type && (value === undefined || t.value === value)) return advance();
    const expected = value !== undefined ? `'${value}'` : type;
    throw new ParseError(`Expected ${expected}, got '${t.value}'`, t.line, t.col);
  };

  // --- Type parsing ---
  const isType = (): boolean => check('KEYWORD', 'int') || check('KEYWORD', 'bool') || check('KEYWORD', 'void');

  const parseType = (): CType => {
    const t = expect('KEYWORD');
    if (t.value === 'int' || t.value === 'bool' || t.value === 'void') return t.value;
    throw new ParseError(`Expected type, got '${t.value}'`, t.line, t.col);
  };

  // --- Expression parsing (precedence climbing) ---

  const parseExpr = (): Expr => parseComma();

  const parseComma = (): Expr => {
    let left = parseAssignment();
    while (match('COMMA')) {
      const right = parseAssignment();
      left = { kind: 'comma', left, right };
    }
    return left;
  };

  const parseAssignment = (): Expr => {
    const expr = parseLogicalOr();
    const assignOps = [
      'ASSIGN', 'PLUS_ASSIGN', 'MINUS_ASSIGN', 'STAR_ASSIGN',
      'SLASH_ASSIGN', 'PERCENT_ASSIGN',
      'AMP_ASSIGN', 'PIPE_ASSIGN', 'CARET_ASSIGN',
      'LSHIFT_ASSIGN', 'RSHIFT_ASSIGN',
    ] as const;
    for (const op of assignOps) {
      if (match(op as TokenType)) {
        if (expr.kind !== 'identifier') {
          throw new ParseError('Invalid assignment target', peek().line, peek().col);
        }
        const value = parseAssignment();
        return { kind: 'assign', op: tokenTypeToOp(op), target: expr, value };
      }
    }
    return expr;
  };

  const parseLogicalOr = (): Expr => {
    let left = parseLogicalAnd();
    while (match('OR')) {
      const right = parseLogicalAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  };

  const parseLogicalAnd = (): Expr => {
    let left = parseBitwiseOr();
    while (match('AND')) {
      const right = parseBitwiseOr();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  };

  const parseBitwiseOr = (): Expr => {
    let left = parseBitwiseXor();
    while (match('PIPE')) {
      const right = parseBitwiseXor();
      left = { kind: 'binary', op: '|', left, right };
    }
    return left;
  };

  const parseBitwiseXor = (): Expr => {
    let left = parseBitwiseAnd();
    while (match('CARET')) {
      const right = parseBitwiseAnd();
      left = { kind: 'binary', op: '^', left, right };
    }
    return left;
  };

  const parseBitwiseAnd = (): Expr => {
    let left = parseEquality();
    while (match('AMP')) {
      const right = parseEquality();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  };

  const parseEquality = (): Expr => {
    let left = parseRelational();
    while (true) {
      if (match('EQ')) { left = { kind: 'binary', op: '==', left, right: parseRelational() }; }
      else if (match('NEQ')) { left = { kind: 'binary', op: '!=', left, right: parseRelational() }; }
      else break;
    }
    return left;
  };

  const parseRelational = (): Expr => {
    let left = parseShift();
    while (true) {
      if (match('LT')) { left = { kind: 'binary', op: '<', left, right: parseShift() }; }
      else if (match('GT')) { left = { kind: 'binary', op: '>', left, right: parseShift() }; }
      else if (match('LEQ')) { left = { kind: 'binary', op: '<=', left, right: parseShift() }; }
      else if (match('GEQ')) { left = { kind: 'binary', op: '>=', left, right: parseShift() }; }
      else break;
    }
    return left;
  };

  const parseShift = (): Expr => {
    let left = parseAdditive();
    while (true) {
      if (match('LSHIFT')) { left = { kind: 'binary', op: '<<', left, right: parseAdditive() }; }
      else if (match('RSHIFT')) { left = { kind: 'binary', op: '>>', left, right: parseAdditive() }; }
      else break;
    }
    return left;
  };

  const parseAdditive = (): Expr => {
    let left = parseMultiplicative();
    while (true) {
      if (match('PLUS')) { left = { kind: 'binary', op: '+', left, right: parseMultiplicative() }; }
      else if (match('MINUS')) { left = { kind: 'binary', op: '-', left, right: parseMultiplicative() }; }
      else break;
    }
    return left;
  };

  const parseMultiplicative = (): Expr => {
    let left = parseUnary();
    while (true) {
      if (match('STAR')) { left = { kind: 'binary', op: '*', left, right: parseUnary() }; }
      else if (match('SLASH')) { left = { kind: 'binary', op: '/', left, right: parseUnary() }; }
      else if (match('PERCENT')) { left = { kind: 'binary', op: '%', left, right: parseUnary() }; }
      else break;
    }
    return left;
  };

  const parseUnary = (): Expr => {
    if (match('NOT'))   return { kind: 'unary', op: '!', operand: parseUnary(), prefix: true };
    if (match('TILDE')) return { kind: 'unary', op: '~', operand: parseUnary(), prefix: true };
    if (match('MINUS')) return { kind: 'unary', op: '-', operand: parseUnary(), prefix: true };
    if (match('INC'))   return { kind: 'unary', op: '++', operand: parseUnary(), prefix: true };
    if (match('DEC'))   return { kind: 'unary', op: '--', operand: parseUnary(), prefix: true };
    return parsePostfix();
  };

  const parsePostfix = (): Expr => {
    let expr = parsePrimary();
    while (true) {
      if (match('INC')) { expr = { kind: 'unary', op: '++', operand: expr, prefix: false }; }
      else if (match('DEC')) { expr = { kind: 'unary', op: '--', operand: expr, prefix: false }; }
      else break;
    }
    return expr;
  };

  const parsePrimary = (): Expr => {
    // Number literal
    if (check('NUMBER')) {
      const t = advance();
      return { kind: 'number', value: parseNumericLiteral(t.value) };
    }

    // Boolean literal
    if (check('KEYWORD', 'true')) { advance(); return { kind: 'bool', value: true }; }
    if (check('KEYWORD', 'false')) { advance(); return { kind: 'bool', value: false }; }

    // Parenthesized expression
    if (match('LPAREN')) {
      const expr = parseExpr();
      expect('RPAREN');
      return expr;
    }

    // Identifier or function call
    if (check('IDENT')) {
      const t = advance();
      if (match('LPAREN')) {
        // Function call
        const args: Expr[] = [];
        if (!check('RPAREN')) {
          args.push(parseAssignment());
          while (match('COMMA')) args.push(parseAssignment());
        }
        expect('RPAREN');
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'identifier', name: t.value };
    }

    const t = peek();
    throw new ParseError(`Unexpected token '${t.value}'`, t.line, t.col);
  };

  // --- Statement parsing ---

  const parseStmt = (): Stmt => {
    // Variable declaration
    if (isType() && !isFollowedByParen()) {
      return parseVarDeclStmt();
    }

    // Block
    if (check('LBRACE')) return parseBlock();

    // if
    if (check('KEYWORD', 'if')) return parseIf();

    // while
    if (check('KEYWORD', 'while')) return parseWhile();

    // for
    if (check('KEYWORD', 'for')) return parseFor();

    // break
    if (match('KEYWORD', 'break')) { expect('SEMI'); return { kind: 'break' }; }

    // continue
    if (match('KEYWORD', 'continue')) { expect('SEMI'); return { kind: 'continue' }; }

    // return
    if (check('KEYWORD', 'return')) return parseReturn();

    // Expression statement
    const expr = parseExpr();
    expect('SEMI');
    return { kind: 'expr_stmt', expr };
  };

  /** Lookahead to distinguish type at start of declaration vs expression */
  const isFollowedByParen = (): boolean => {
    // Check if next token after current keyword is identifier (decl) or ( (cast/grouping)
    // For "void main(void)" — we only see this at top level, not here
    // At statement level, "int x" is a var decl; "int" alone is an error
    // We need to check: type IDENT ... -> declaration
    const saved = pos;
    advance(); // skip type keyword
    const isIdent = check('IDENT');
    pos = saved;
    return !isIdent;
  };

  const parseVarDeclStmt = (): VarDecl => {
    const type = parseType();
    const name = expect('IDENT').value;
    let init: Expr | null = null;
    if (match('ASSIGN')) init = parseAssignment();
    expect('SEMI');
    return { kind: 'var_decl', type, name, init };
  };

  const parseBlock = (): Stmt => {
    expect('LBRACE');
    const body: Stmt[] = [];
    while (!check('RBRACE') && !check('EOF')) {
      body.push(parseStmt());
    }
    expect('RBRACE');
    return { kind: 'block', body };
  };

  const parseBlockStmts = (): Stmt[] => {
    expect('LBRACE');
    const body: Stmt[] = [];
    while (!check('RBRACE') && !check('EOF')) {
      body.push(parseStmt());
    }
    expect('RBRACE');
    return body;
  };

  const parseIf = (): Stmt => {
    expect('KEYWORD', 'if');
    expect('LPAREN');
    const condition = parseExpr();
    expect('RPAREN');
    const thenBody = check('LBRACE') ? parseBlockStmts() : [parseStmt()];
    let elseBody: Stmt[] | null = null;
    if (match('KEYWORD', 'else')) {
      if (check('KEYWORD', 'if')) {
        elseBody = [parseIf()];
      } else {
        elseBody = check('LBRACE') ? parseBlockStmts() : [parseStmt()];
      }
    }
    return { kind: 'if', condition, thenBody, elseBody };
  };

  const parseWhile = (): Stmt => {
    expect('KEYWORD', 'while');
    expect('LPAREN');
    const condition = parseExpr();
    expect('RPAREN');
    const body = check('LBRACE') ? parseBlockStmts() : [parseStmt()];
    return { kind: 'while', condition, body };
  };

  const parseFor = (): Stmt => {
    expect('KEYWORD', 'for');
    expect('LPAREN');

    // Init
    let init: VarDecl | { kind: 'expr_stmt'; expr: Expr } | null = null;
    if (!check('SEMI')) {
      if (isType() && !isFollowedByParen()) {
        const type = parseType();
        const name = expect('IDENT').value;
        let initExpr: Expr | null = null;
        if (match('ASSIGN')) initExpr = parseAssignment();
        expect('SEMI');
        init = { kind: 'var_decl', type, name, init: initExpr };
      } else {
        const expr = parseExpr();
        expect('SEMI');
        init = { kind: 'expr_stmt', expr };
      }
    } else {
      expect('SEMI');
    }

    // Condition
    const condition = check('SEMI') ? null : parseExpr();
    expect('SEMI');

    // Update
    const update = check('RPAREN') ? null : parseExpr();
    expect('RPAREN');

    const body = check('LBRACE') ? parseBlockStmts() : [parseStmt()];
    return { kind: 'for', init, condition, update, body };
  };

  const parseReturn = (): Stmt => {
    expect('KEYWORD', 'return');
    if (match('SEMI')) return { kind: 'return', value: null };
    const value = parseExpr();
    expect('SEMI');
    return { kind: 'return', value };
  };

  // --- Top-level parsing ---

  const parseTopLevel = (): TopLevel => {
    const type = parseType();
    const name = expect('IDENT').value;

    // Function declaration
    if (match('LPAREN')) {
      const params: { type: CType; name: string }[] = [];
      if (!(check('KEYWORD', 'void') && tokens[pos + 1]?.type === 'RPAREN')) {
        if (!check('RPAREN')) {
          const pType = parseType();
          const pName = expect('IDENT').value;
          params.push({ type: pType, name: pName });
          while (match('COMMA')) {
            const pt = parseType();
            const pn = expect('IDENT').value;
            params.push({ type: pt, name: pn });
          }
        }
      } else {
        advance(); // skip 'void'
      }
      expect('RPAREN');
      const body = parseBlockStmts();
      return { kind: 'func_decl', returnType: type, name, params, body } as FuncDecl;
    }

    // Global variable
    let init: Expr | null = null;
    if (match('ASSIGN')) init = parseAssignment();
    expect('SEMI');
    return { kind: 'global_var', type, name, init } as GlobalVarDecl;
  };

  // --- Program parsing ---

  const declarations: TopLevel[] = [];
  while (!check('EOF')) {
    declarations.push(parseTopLevel());
  }

  return { declarations };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumericLiteral(s: string): number {
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s.slice(2), 16);
  if (s.startsWith('0b') || s.startsWith('0B')) return parseInt(s.slice(2), 2);
  return parseInt(s, 10);
}

function tokenTypeToOp(t: string): string {
  const map: Record<string, string> = {
    ASSIGN: '=', PLUS_ASSIGN: '+=', MINUS_ASSIGN: '-=',
    STAR_ASSIGN: '*=', SLASH_ASSIGN: '/=', PERCENT_ASSIGN: '%=',
    AMP_ASSIGN: '&=', PIPE_ASSIGN: '|=', CARET_ASSIGN: '^=',
    LSHIFT_ASSIGN: '<<=', RSHIFT_ASSIGN: '>>=',
  };
  return map[t] ?? '=';
}
