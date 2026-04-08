/**
 * Preprocessor for Mini-C.
 * Handles #define for constants and function-like macros.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ObjectMacro {
  readonly kind: 'object';
  readonly body: string;
}

interface FunctionMacro {
  readonly kind: 'function';
  readonly params: readonly string[];
  readonly body: string;
}

type Macro = ObjectMacro | FunctionMacro;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process #define directives and expand macros.
 * Returns the preprocessed source with all macros expanded.
 */
export function preprocess(source: string): string {
  const macros = new Map<string, Macro>();
  const lines = joinContinuationLines(source).split('\n');
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('#define')) {
      parseDefine(trimmed, macros);
      output.push(''); // preserve line numbering
    } else {
      output.push(expandMacros(line, macros));
    }
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Line continuation
// ---------------------------------------------------------------------------

function joinContinuationLines(source: string): string {
  return source.replace(/\\\s*\n/g, ' ');
}

// ---------------------------------------------------------------------------
// #define parsing
// ---------------------------------------------------------------------------

function parseDefine(line: string, macros: Map<string, Macro>): void {
  // Strip "#define"
  const rest = line.slice(7).trimStart();
  if (rest.length === 0) return;

  // Check for function-like macro: NAME(params...)
  const funcMatch = rest.match(/^([a-zA-Z_]\w*)\(([^)]*)\)\s*(.*)/);
  if (funcMatch) {
    const name = funcMatch[1];
    const params = funcMatch[2].split(',').map(p => p.trim()).filter(p => p.length > 0);
    const body = funcMatch[3].trim();
    macros.set(name, { kind: 'function', params, body });
    return;
  }

  // Object-like macro: NAME value
  const objMatch = rest.match(/^([a-zA-Z_]\w*)\s*(.*)/);
  if (objMatch) {
    const name = objMatch[1];
    const body = objMatch[2].trim();
    macros.set(name, { kind: 'object', body });
  }
}

// ---------------------------------------------------------------------------
// Macro expansion
// ---------------------------------------------------------------------------

/**
 * Expand all macros in a single line of text.
 * Applies expansions repeatedly until no more can be done (max 32 passes).
 */
function expandMacros(line: string, macros: ReadonlyMap<string, Macro>): string {
  if (macros.size === 0) return line;

  let result = line;
  for (let pass = 0; pass < 32; pass++) {
    const next = expandOnce(result, macros);
    if (next === result) break;
    result = next;
  }
  return result;
}

function expandOnce(text: string, macros: ReadonlyMap<string, Macro>): string {
  // Match identifiers and try to expand them
  let result = '';
  let i = 0;

  while (i < text.length) {
    // Skip string literals
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      result += text[i++];
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') { result += text[i++]; }
        if (i < text.length) result += text[i++];
      }
      if (i < text.length) result += text[i++];
      continue;
    }

    // Skip single-line comments
    if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
      result += text.slice(i);
      break;
    }

    // Match identifiers
    if (/[a-zA-Z_]/.test(text[i])) {
      let ident = '';
      const start = i;
      while (i < text.length && /[a-zA-Z0-9_]/.test(text[i])) ident += text[i++];

      const macro = macros.get(ident);
      if (!macro) {
        result += ident;
        continue;
      }

      if (macro.kind === 'object') {
        result += macro.body;
        continue;
      }

      // Function-like macro: must be followed by (
      if (macro.kind === 'function') {
        // Skip whitespace before paren
        let j = i;
        while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
        if (j < text.length && text[j] === '(') {
          const args = extractMacroArgs(text, j);
          if (args) {
            i = args.endPos;
            result += substituteMacroParams(macro.body, macro.params, args.args);
            continue;
          }
        }
        // No parentheses after function macro name — leave as-is
        result += ident;
        continue;
      }
    }

    result += text[i++];
  }

  return result;
}

/**
 * Extract comma-separated arguments from text starting at the '(' position.
 * Handles nested parentheses.
 */
function extractMacroArgs(
  text: string,
  openParen: number,
): { args: string[]; endPos: number } | null {
  let depth = 0;
  let i = openParen;
  const args: string[] = [];
  let current = '';

  i++; // skip (
  depth = 1;

  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        args.push(current.trim());
        i++;
        break;
      }
      current += ch;
    } else if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i++;
  }

  // Remove empty single arg (for zero-argument macro calls)
  if (args.length === 1 && args[0] === '') return { args: [], endPos: i };

  return { args, endPos: i };
}

/**
 * Substitute macro parameter names with argument values in the body.
 */
function substituteMacroParams(
  body: string,
  params: readonly string[],
  args: readonly string[],
): string {
  let result = body;
  for (let i = 0; i < params.length && i < args.length; i++) {
    // Replace whole-word occurrences of parameter name
    const pattern = new RegExp(`\\b${escapeRegex(params[i])}\\b`, 'g');
    result = result.replace(pattern, args[i]);
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
