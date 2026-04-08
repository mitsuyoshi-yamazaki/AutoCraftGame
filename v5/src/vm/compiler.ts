/**
 * Mini-C compiler for the v4 VM.
 *
 * Translates Mini-C source (.c) into assembly (.asm) that can be
 * assembled into binary by the assembler.
 *
 * Pipeline: source -> preprocess -> tokenize -> parse -> codegen -> assembly
 */

import { preprocess } from './compiler/preprocessor.js';
import { tokenize } from './compiler/lexer.js';
import { parse, ParseError } from './compiler/parser.js';
import { generate } from './compiler/codegen.js';

// ---------------------------------------------------------------------------
// Built-in constants (injected before user code)
// ---------------------------------------------------------------------------

const BUILTIN_CONSTANTS = `
#define FILTER_ALL          0
#define FILTER_ORE          1
#define FILTER_CRYSTAL      2
#define FILTER_ENERGY       3
#define FILTER_RESOURCE     4
#define FILTER_ALL_NODE     5
#define FILTER_REMAINS      6
#define FILTER_ACTIVE_CHAR  7
#define FILTER_INACTIVE_CHAR 8
#define FILTER_ALL_CHAR     9

#define TYPE_ORE_NODE       1
#define TYPE_CRYSTAL_NODE   2
#define TYPE_ENERGY_NODE    3
#define TYPE_REMAINS        4
#define TYPE_ACTIVE_CHAR    5
#define TYPE_INACTIVE_CHAR  6

#define COMP_FRAME          0
#define COMP_ACTUATOR       1
#define COMP_HARVESTER      2
#define COMP_CHARGER        3
#define COMP_ASSEMBLER      4
#define COMP_PROCESSOR      5
#define COMP_SENSOR         6
#define COMP_DISASSEMBLER   7
#define COMP_MEMORYCORE     8

#define PROP_TYPE           0
#define PROP_ANGLE          1
#define PROP_DISTANCE       2
#define PROP_ENERGY         3
#define PROP_DURABILITY     4
#define PROP_COMPONENTS     5
#define PROP_SPECIES        6
#define PROP_RESOURCE_TYPE  7
#define PROP_REMAINING      8

#define RECIPE_METAL        0
#define RECIPE_CIRCUIT      1

#define ITEM_ORE            0
#define ITEM_CRYSTAL        1
#define ITEM_METAL          2
#define ITEM_CIRCUIT        3
#define ITEM_FRAME          4
#define ITEM_ACTUATOR       5
#define ITEM_HARVESTER      6
#define ITEM_CHARGER        7
#define ITEM_ASSEMBLER      8
#define ITEM_PROCESSOR      9
#define ITEM_SENSOR         10
#define ITEM_DISASSEMBLER   11
#define ITEM_MEMORYCORE     12
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompileResult {
  readonly assembly: string;
  readonly errors: string[];
}

/**
 * Compile Mini-C source to assembly.
 */
export function compile(source: string): CompileResult {
  const errors: string[] = [];

  try {
    // Step 1: Inject built-in constants and preprocess
    const fullSource = BUILTIN_CONSTANTS + '\n' + source;
    const preprocessed = preprocess(fullSource);

    // Step 2: Tokenize
    const tokens = tokenize(preprocessed);

    // Step 3: Parse
    const ast = parse(tokens);

    // Step 4: Generate assembly
    const assembly = generate(ast);

    return { assembly, errors };
  } catch (e) {
    if (e instanceof ParseError) {
      errors.push(e.message);
    } else if (e instanceof Error) {
      errors.push(e.message);
    } else {
      errors.push(String(e));
    }
    return { assembly: '', errors };
  }
}
