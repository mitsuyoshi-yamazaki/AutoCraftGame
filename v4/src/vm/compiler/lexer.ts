/**
 * Lexer for Mini-C.
 * Tokenizes source code into a flat list of tokens.
 */

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export type TokenType =
  | 'NUMBER' | 'IDENT' | 'KEYWORD' | 'STRING'
  // Operators
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'AMP' | 'PIPE' | 'CARET' | 'TILDE' | 'LSHIFT' | 'RSHIFT'
  | 'AND' | 'OR' | 'NOT'
  | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LEQ' | 'GEQ'
  | 'ASSIGN' | 'PLUS_ASSIGN' | 'MINUS_ASSIGN' | 'STAR_ASSIGN'
  | 'SLASH_ASSIGN' | 'PERCENT_ASSIGN'
  | 'AMP_ASSIGN' | 'PIPE_ASSIGN' | 'CARET_ASSIGN'
  | 'LSHIFT_ASSIGN' | 'RSHIFT_ASSIGN'
  | 'INC' | 'DEC'
  // Punctuation
  | 'LPAREN' | 'RPAREN' | 'LBRACE' | 'RBRACE'
  | 'SEMI' | 'COMMA'
  // Special
  | 'EOF';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const KEYWORDS = new Set([
  'int', 'bool', 'void',
  'if', 'else', 'while', 'for',
  'break', 'continue', 'return',
  'true', 'false',
]);

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  const peek = (): string => (pos < source.length ? source[pos] : '\0');
  const peek2 = (): string => (pos + 1 < source.length ? source[pos + 1] : '\0');
  const advance = (): string => {
    const ch = source[pos++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  };
  const match = (ch: string): boolean => {
    if (peek() === ch) { advance(); return true; }
    return false;
  };
  const addToken = (type: TokenType, value: string, startLine: number, startCol: number): void => {
    tokens.push({ type, value, line: startLine, col: startCol });
  };

  while (pos < source.length) {
    const startLine = line;
    const startCol = col;
    const ch = advance();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') continue;

    // Single-line comment
    if (ch === '/' && peek() === '/') {
      while (pos < source.length && peek() !== '\n') advance();
      continue;
    }

    // Block comment
    if (ch === '/' && peek() === '*') {
      advance(); // consume *
      while (pos < source.length) {
        if (advance() === '*' && peek() === '/') { advance(); break; }
      }
      continue;
    }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      let num = ch;
      if (ch === '0' && (peek() === 'x' || peek() === 'X')) {
        num += advance();
        while (pos < source.length && /[0-9a-fA-F]/.test(peek())) num += advance();
      } else if (ch === '0' && (peek() === 'b' || peek() === 'B')) {
        num += advance();
        while (pos < source.length && (peek() === '0' || peek() === '1')) num += advance();
      } else {
        while (pos < source.length && peek() >= '0' && peek() <= '9') num += advance();
      }
      addToken('NUMBER', num, startLine, startCol);
      continue;
    }

    // Identifiers and keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = ch;
      while (pos < source.length && /[a-zA-Z0-9_]/.test(peek())) id += advance();
      const type: TokenType = KEYWORDS.has(id) ? 'KEYWORD' : 'IDENT';
      addToken(type, id, startLine, startCol);
      continue;
    }

    // Two-character and single-character operators/punctuation
    switch (ch) {
      case '(': addToken('LPAREN', '(', startLine, startCol); break;
      case ')': addToken('RPAREN', ')', startLine, startCol); break;
      case '{': addToken('LBRACE', '{', startLine, startCol); break;
      case '}': addToken('RBRACE', '}', startLine, startCol); break;
      case ';': addToken('SEMI', ';', startLine, startCol); break;
      case ',': addToken('COMMA', ',', startLine, startCol); break;
      case '~': addToken('TILDE', '~', startLine, startCol); break;
      case '+':
        if (match('+')) addToken('INC', '++', startLine, startCol);
        else if (match('=')) addToken('PLUS_ASSIGN', '+=', startLine, startCol);
        else addToken('PLUS', '+', startLine, startCol);
        break;
      case '-':
        if (match('-')) addToken('DEC', '--', startLine, startCol);
        else if (match('=')) addToken('MINUS_ASSIGN', '-=', startLine, startCol);
        else addToken('MINUS', '-', startLine, startCol);
        break;
      case '*':
        if (match('=')) addToken('STAR_ASSIGN', '*=', startLine, startCol);
        else addToken('STAR', '*', startLine, startCol);
        break;
      case '/':
        if (match('=')) addToken('SLASH_ASSIGN', '/=', startLine, startCol);
        else addToken('SLASH', '/', startLine, startCol);
        break;
      case '%':
        if (match('=')) addToken('PERCENT_ASSIGN', '%=', startLine, startCol);
        else addToken('PERCENT', '%', startLine, startCol);
        break;
      case '&':
        if (match('&')) addToken('AND', '&&', startLine, startCol);
        else if (match('=')) addToken('AMP_ASSIGN', '&=', startLine, startCol);
        else addToken('AMP', '&', startLine, startCol);
        break;
      case '|':
        if (match('|')) addToken('OR', '||', startLine, startCol);
        else if (match('=')) addToken('PIPE_ASSIGN', '|=', startLine, startCol);
        else addToken('PIPE', '|', startLine, startCol);
        break;
      case '^':
        if (match('=')) addToken('CARET_ASSIGN', '^=', startLine, startCol);
        else addToken('CARET', '^', startLine, startCol);
        break;
      case '=':
        if (match('=')) addToken('EQ', '==', startLine, startCol);
        else addToken('ASSIGN', '=', startLine, startCol);
        break;
      case '!':
        if (match('=')) addToken('NEQ', '!=', startLine, startCol);
        else addToken('NOT', '!', startLine, startCol);
        break;
      case '<':
        if (match('<')) {
          if (match('=')) addToken('LSHIFT_ASSIGN', '<<=', startLine, startCol);
          else addToken('LSHIFT', '<<', startLine, startCol);
        } else if (match('=')) addToken('LEQ', '<=', startLine, startCol);
        else addToken('LT', '<', startLine, startCol);
        break;
      case '>':
        if (match('>')) {
          if (match('=')) addToken('RSHIFT_ASSIGN', '>>=', startLine, startCol);
          else addToken('RSHIFT', '>>', startLine, startCol);
        } else if (match('=')) addToken('GEQ', '>=', startLine, startCol);
        else addToken('GT', '>', startLine, startCol);
        break;
      default:
        // Skip unknown characters
        break;
    }
  }

  addToken('EOF', '', line, col);
  return tokens;
}
