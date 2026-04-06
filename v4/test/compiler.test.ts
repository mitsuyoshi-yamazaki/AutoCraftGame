import { describe, it, expect } from 'vitest';
import { compile } from '../src/vm/compiler.js';
import { assemble } from '../src/vm/assembler.js';

// ---------------------------------------------------------------------------
// Helper: compile and assert no errors
// ---------------------------------------------------------------------------

function compileOk(source: string): string {
  const result = compile(source);
  expect(result.errors).toEqual([]);
  expect(result.assembly.length).toBeGreaterThan(0);
  return result.assembly;
}

// ---------------------------------------------------------------------------
// Helper: compile then assemble, assert both succeed
// ---------------------------------------------------------------------------

function compileAndAssemble(source: string): { assembly: string; words: number[] } {
  const compiled = compile(source);
  expect(compiled.errors).toEqual([]);
  const assembled = assemble(compiled.assembly);
  expect(assembled.errors).toEqual([]);
  expect(assembled.words.length).toBeGreaterThan(0);
  return { assembly: compiled.assembly, words: assembled.words };
}

// ---------------------------------------------------------------------------
// 1. Full compile pipeline tests
// ---------------------------------------------------------------------------

describe('compiler: full pipeline', () => {
  describe('simple void main with halt()', () => {
    it('compiles minimal main function', () => {
      const asm = compileOk(`
        void main(void) {
          halt();
        }
      `);
      expect(asm).toContain('_main:');
      expect(asm).toContain('HALT');
    });

    it('compiles empty main function', () => {
      const asm = compileOk(`
        void main(void) {
        }
      `);
      expect(asm).toContain('_main:');
      expect(asm).toContain('JMP _main');
    });
  });

  describe('variable declarations and assignments', () => {
    it('compiles local variable declaration with initializer', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 10;
          halt();
        }
      `);
      expect(asm).toContain('LI r1, 10');
      expect(asm).toContain('PUSH r1');
    });

    it('compiles variable declaration without initializer', () => {
      const asm = compileOk(`
        void main(void) {
          int x;
          halt();
        }
      `);
      // Uninitialized local pushes r0 (zero)
      expect(asm).toContain('PUSH r0');
    });

    it('compiles variable assignment', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 0;
          x = 42;
          halt();
        }
      `);
      expect(asm).toContain('LI r1, 42');
      expect(asm).toContain('SW r1');
    });

    it('compiles compound assignment operators', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 10;
          x += 5;
          x -= 2;
          x *= 3;
          halt();
        }
      `);
      expect(asm).toContain('ADD r1, r1, r2');
      expect(asm).toContain('SUB r1, r1, r2');
      expect(asm).toContain('MUL r1, r1, r2');
    });

    it('compiles global variable', () => {
      const asm = compileOk(`
        int counter = 0;
        void main(void) {
          counter = 5;
          halt();
        }
      `);
      expect(asm).toContain('_g_counter:');
      expect(asm).toContain('.word 0');
    });

    it('compiles bool variable', () => {
      const asm = compileOk(`
        void main(void) {
          bool flag = true;
          flag = false;
          halt();
        }
      `);
      expect(asm).toContain('LI r1, 1');
    });
  });

  describe('if-else branching', () => {
    it('compiles simple if statement', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 1;
          if (x) {
            halt();
          }
        }
      `);
      expect(asm).toContain('BEQL r1, r0');
    });

    it('compiles if-else statement', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 1;
          if (x) {
            halt();
          } else {
            halt();
          }
        }
      `);
      expect(asm).toContain('BEQL r1, r0');
      // Should have a JMP to skip else branch
      expect(asm).toMatch(/JMP _L\d+/);
    });

    it('compiles if-else-if chain', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 1;
          if (x == 1) {
            halt();
          } else if (x == 2) {
            halt();
          } else {
            halt();
          }
        }
      `);
      // Should contain multiple branch labels
      const labelMatches = asm.match(/_L\d+:/g);
      expect(labelMatches).not.toBeNull();
      expect(labelMatches!.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('while loop', () => {
    it('compiles while loop', () => {
      const asm = compileOk(`
        void main(void) {
          int i = 0;
          while (i < 10) {
            i = i + 1;
          }
          halt();
        }
      `);
      // Loop start label, condition branch, JMP back
      expect(asm).toMatch(/_L\d+:/);
      expect(asm).toContain('BEQL r1, r0');
      expect(asm).toMatch(/JMP _L\d+/);
    });

    it('compiles while loop with break', () => {
      const asm = compileOk(`
        void main(void) {
          int i = 0;
          while (i < 100) {
            if (i == 50) {
              break;
            }
            i = i + 1;
          }
          halt();
        }
      `);
      // break should emit a JMP to the loop end label
      const jmpMatches = asm.match(/JMP _L\d+/g);
      expect(jmpMatches).not.toBeNull();
      expect(jmpMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it('compiles while loop with continue', () => {
      const asm = compileOk(`
        void main(void) {
          int i = 0;
          while (i < 10) {
            i = i + 1;
            if (i == 5) {
              continue;
            }
          }
          halt();
        }
      `);
      const jmpMatches = asm.match(/JMP _L\d+/g);
      expect(jmpMatches).not.toBeNull();
      expect(jmpMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('for loop', () => {
    it('compiles basic for loop', () => {
      const asm = compileOk(`
        void main(void) {
          for (int i = 0; i < 10; i++) {
            halt();
          }
        }
      `);
      expect(asm).toMatch(/_L\d+:/);
      expect(asm).toContain('BEQL r1, r0');
    });

    it('compiles for loop with expression init', () => {
      const asm = compileOk(`
        void main(void) {
          int i;
          for (i = 0; i < 5; i++) {
            halt();
          }
        }
      `);
      expect(asm).toMatch(/_L\d+:/);
    });

    it('compiles for loop with empty parts', () => {
      const asm = compileOk(`
        void main(void) {
          int i = 0;
          for (;;) {
            if (i >= 10) {
              break;
            }
            i++;
          }
          halt();
        }
      `);
      // Infinite loop pattern: loop label then JMP back, no condition branch
      expect(asm).toMatch(/_L\d+:/);
    });
  });

  describe('function calls', () => {
    it('compiles user-defined function call', () => {
      const asm = compileOk(`
        int add(int a, int b) {
          return a + b;
        }
        void main(void) {
          int result = add(3, 4);
          halt();
        }
      `);
      expect(asm).toContain('_add:');
      expect(asm).toContain('LI r5, _add');
      expect(asm).toContain('JALR r6, r5');
    });

    it('compiles function with return value', () => {
      const asm = compileOk(`
        int square(int n) {
          return n * n;
        }
        void main(void) {
          int r = square(5);
          halt();
        }
      `);
      expect(asm).toContain('_square:');
      expect(asm).toContain('MUL r1, r1, r2');
      expect(asm).toContain('JMP _square_epilogue');
    });

    it('compiles void function call', () => {
      const asm = compileOk(`
        void do_nothing(void) {
          return;
        }
        void main(void) {
          do_nothing();
          halt();
        }
      `);
      expect(asm).toContain('_do_nothing:');
      expect(asm).toContain('LI r5, _do_nothing');
    });
  });

  describe('game API calls', () => {
    it('compiles move(direction)', () => {
      const asm = compileOk(`
        void main(void) {
          move(90);
          halt();
        }
      `);
      // move writes to actuator I/O ports
      expect(asm).toContain('OUT r2, r1');
    });

    it('compiles harvest()', () => {
      const asm = compileOk(`
        void main(void) {
          harvest();
          halt();
        }
      `);
      expect(asm).toContain('OUT r2, r1');
    });

    it('compiles sense(filter)', () => {
      const asm = compileOk(`
        void main(void) {
          int count = sense(FILTER_ALL);
          halt();
        }
      `);
      // sense reads from sensor I/O ports
      expect(asm).toContain('IN r1, r2');
    });

    it('compiles recharge()', () => {
      const asm = compileOk(`
        void main(void) {
          recharge();
          halt();
        }
      `);
      expect(asm).toContain('OUT r2, r1');
    });

    it('compiles my_energy()', () => {
      const asm = compileOk(`
        void main(void) {
          int e = my_energy();
          halt();
        }
      `);
      expect(asm).toContain('IN r1, r2');
    });

    it('compiles sense workflow', () => {
      const asm = compileOk(`
        void main(void) {
          int n = sense(FILTER_RESOURCE);
          if (n > 0) {
            sense_select(0);
            int angle = sense_angle();
            move(angle);
          }
          halt();
        }
      `);
      expect(asm).toContain('_main:');
      expect(asm).toContain('HALT');
    });

    it('compiles assemble() with 6 args', () => {
      const asm = compileOk(`
        void main(void) {
          int child = assemble(1, 1, 1, 1, 1, 1);
          halt();
        }
      `);
      // assemble pushes 6 args and pops them to I/O ports
      expect(asm).toContain('HALT');
    });

    it('compiles query(id, property)', () => {
      const asm = compileOk(`
        void main(void) {
          int t = query(1, PROP_TYPE);
          halt();
        }
      `);
      expect(asm).toContain('IN r1, r2');
    });

    it('compiles process and craft', () => {
      const asm = compileOk(`
        void main(void) {
          process(RECIPE_METAL);
          craft(COMP_FRAME);
          halt();
        }
      `);
      expect(asm).toContain('OUT r2, r1');
    });
  });

  describe('#define macros', () => {
    it('expands object-like macro', () => {
      const asm = compileOk(`
        #define MAX_HEALTH 100
        void main(void) {
          int h = MAX_HEALTH;
          halt();
        }
      `);
      expect(asm).toContain('LI r1, 100');
    });

    it('expands function-like macro', () => {
      const asm = compileOk(`
        #define MAX(a, b) ((a) > (b) ? (a) : (b))
        #define DOUBLE(x) ((x) + (x))
        void main(void) {
          int d = DOUBLE(5);
          halt();
        }
      `);
      // DOUBLE(5) -> ((5) + (5)) -> generates ADD
      expect(asm).toContain('ADD r1, r1, r2');
    });

    it('expands built-in FILTER constants', () => {
      const asm = compileOk(`
        void main(void) {
          int n = sense(FILTER_RESOURCE);
          halt();
        }
      `);
      // FILTER_RESOURCE is 4
      expect(asm).toContain('LI r1, 4');
    });

    it('expands built-in COMP constants', () => {
      const asm = compileOk(`
        void main(void) {
          craft(COMP_SENSOR);
          halt();
        }
      `);
      // COMP_SENSOR is 6
      expect(asm).toContain('LI r1, 6');
    });
  });

  describe('arithmetic expressions', () => {
    it('compiles addition', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 3 + 4;
          halt();
        }
      `);
      expect(asm).toContain('ADD r1, r1, r2');
    });

    it('compiles subtraction', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 10 - 3;
          halt();
        }
      `);
      expect(asm).toContain('SUB r1, r1, r2');
    });

    it('compiles multiplication', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 5 * 6;
          halt();
        }
      `);
      expect(asm).toContain('MUL r1, r1, r2');
    });

    it('compiles division and modulo', () => {
      const asm = compileOk(`
        void main(void) {
          int a = 10 / 3;
          int b = 10 % 3;
          halt();
        }
      `);
      expect(asm).toContain('DIV r1, r1, r2');
      expect(asm).toContain('MOD r1, r1, r2');
    });

    it('compiles complex nested arithmetic', () => {
      const asm = compileOk(`
        void main(void) {
          int x = (3 + 4) * (10 - 2);
          halt();
        }
      `);
      expect(asm).toContain('ADD r1, r1, r2');
      expect(asm).toContain('SUB r1, r1, r2');
      expect(asm).toContain('MUL r1, r1, r2');
    });

    it('compiles unary negation', () => {
      const asm = compileOk(`
        void main(void) {
          int x = -5;
          halt();
        }
      `);
      expect(asm).toContain('SUB r1, r0, r1');
    });

    it('compiles increment and decrement', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 0;
          x++;
          x--;
          ++x;
          --x;
          halt();
        }
      `);
      expect(asm).toContain('ADDI r1, r1, 1');
      expect(asm).toContain('ADDI r1, r1, -1');
    });

    it('compiles bitwise operations', () => {
      const asm = compileOk(`
        void main(void) {
          int a = 0xFF & 0x0F;
          int b = 0xF0 | 0x0F;
          int c = 0xFF ^ 0xAA;
          int d = 1 << 3;
          int e = 8 >> 1;
          halt();
        }
      `);
      expect(asm).toContain('AND r1, r1, r2');
      expect(asm).toContain('OR r1, r1, r2');
      expect(asm).toContain('XOR r1, r1, r2');
      expect(asm).toContain('SHL r1, r1, r2');
      expect(asm).toContain('SHR r1, r1, r2');
    });

    it('compiles bitwise NOT', () => {
      const asm = compileOk(`
        void main(void) {
          int x = ~0;
          halt();
        }
      `);
      // ~ is XOR with 0xFFFF
      expect(asm).toContain('LI r2, 65535');
      expect(asm).toContain('XOR r1, r1, r2');
    });
  });

  describe('comparison operators', () => {
    it('compiles == comparison', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 5;
          bool eq = (x == 5);
          halt();
        }
      `);
      expect(asm).toContain('BEQL r1, r2');
    });

    it('compiles != comparison', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 5;
          bool ne = (x != 3);
          halt();
        }
      `);
      expect(asm).toContain('BNEL r1, r2');
    });

    it('compiles < comparison', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 3;
          bool lt = (x < 10);
          halt();
        }
      `);
      expect(asm).toContain('BLTL r1, r2');
    });

    it('compiles >= comparison', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 10;
          bool ge = (x >= 5);
          halt();
        }
      `);
      expect(asm).toContain('BGEL r1, r2');
    });

    it('compiles > comparison (swaps to <)', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 10;
          bool gt = (x > 3);
          halt();
        }
      `);
      // a > b is implemented as b < a (swap then BLTL)
      expect(asm).toContain('BLTL r1, r2');
    });

    it('compiles <= comparison (swaps to >=)', () => {
      const asm = compileOk(`
        void main(void) {
          int x = 3;
          bool le = (x <= 10);
          halt();
        }
      `);
      // a <= b is implemented as b >= a (swap then BGEL)
      expect(asm).toContain('BGEL r1, r2');
    });

    it('compiles logical AND (short-circuit)', () => {
      const asm = compileOk(`
        void main(void) {
          int a = 1;
          int b = 2;
          bool r = a && b;
          halt();
        }
      `);
      // && short-circuits: if left is false, skip right
      expect(asm).toContain('BEQL r1, r0');
      expect(asm).toContain('BNEL r1, r0');
    });

    it('compiles logical OR (short-circuit)', () => {
      const asm = compileOk(`
        void main(void) {
          int a = 0;
          int b = 1;
          bool r = a || b;
          halt();
        }
      `);
      // || short-circuits: if left is true, skip right
      expect(asm).toContain('BNEL r1, r0');
      expect(asm).toContain('BEQL r1, r0');
    });

    it('compiles logical NOT', () => {
      const asm = compileOk(`
        void main(void) {
          bool x = !false;
          halt();
        }
      `);
      expect(asm).toContain('BEQL r1, r0');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Assembly validation: compiled output assembles without errors
// ---------------------------------------------------------------------------

describe('compiler: assembly validation', () => {
  it('minimal main assembles correctly', () => {
    compileAndAssemble(`
      void main(void) {
        halt();
      }
    `);
  });

  it('variable operations assemble correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int x = 10;
        int y = 20;
        int z = x + y;
        halt();
      }
    `);
  });

  it('if-else assembles correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int x = 5;
        if (x > 3) {
          int y = 1;
        } else {
          int y = 2;
        }
        halt();
      }
    `);
  });

  it('while loop assembles correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int i = 0;
        while (i < 10) {
          i = i + 1;
        }
        halt();
      }
    `);
  });

  it('for loop assembles correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int sum = 0;
        for (int i = 0; i < 10; i++) {
          sum += i;
        }
        halt();
      }
    `);
  });

  it('function call assembles correctly', () => {
    compileAndAssemble(`
      int double(int n) {
        return n * 2;
      }
      void main(void) {
        int r = double(21);
        halt();
      }
    `);
  });

  it('game API calls assemble correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int e = my_energy();
        move(90);
        harvest();
        recharge();
        int n = sense(FILTER_ALL);
        halt();
      }
    `);
  });

  it('complex program with all features assembles correctly', () => {
    compileAndAssemble(`
      #define THRESHOLD 50
      int state = 0;

      int clamp(int val, int lo, int hi) {
        if (val < lo) { return lo; }
        if (val > hi) { return hi; }
        return val;
      }

      void main(void) {
        int e = my_energy();
        if (e < THRESHOLD) {
          int n = sense(FILTER_ENERGY);
          if (n > 0) {
            sense_select(0);
            int angle = sense_angle();
            move(angle);
          }
          recharge();
        } else {
          int n = sense(FILTER_RESOURCE);
          for (int i = 0; i < n; i++) {
            sense_select(i);
            int dist = sense_distance();
            if (dist < 100) {
              int angle = sense_angle();
              move(angle);
              harvest();
              break;
            }
          }
        }
        state = clamp(state + 1, 0, 10);
        halt();
      }
    `);
  });

  it('nested loops assemble correctly', () => {
    compileAndAssemble(`
      void main(void) {
        int total = 0;
        for (int i = 0; i < 5; i++) {
          for (int j = 0; j < 5; j++) {
            total += i * j;
          }
        }
        halt();
      }
    `);
  });

  it('multiple functions assemble correctly', () => {
    compileAndAssemble(`
      int min(int a, int b) {
        if (a < b) { return a; }
        return b;
      }
      int max(int a, int b) {
        if (a > b) { return a; }
        return b;
      }
      void main(void) {
        int lo = min(3, 7);
        int hi = max(3, 7);
        halt();
      }
    `);
  });
});

// ---------------------------------------------------------------------------
// 3. Error cases
// ---------------------------------------------------------------------------

describe('compiler: error cases', () => {
  it('reports error for missing main function', () => {
    // Without main, the JMP _main will have no target in assembly
    const compiled = compile(`
      void helper(void) {
        halt();
      }
    `);
    // The compiler itself does not error, but assembling should fail
    // because JMP _main references a nonexistent label
    const assembled = assemble(compiled.assembly);
    expect(assembled.errors.length).toBeGreaterThan(0);
  });

  it('reports error for undefined variable (generates error comment)', () => {
    const asm = compileOk(`
      void main(void) {
        int x = undefined_var;
        halt();
      }
    `);
    // The codegen emits an error comment for undefined variables
    expect(asm).toContain('; ERROR: undefined variable');
  });

  it('reports error for undefined function (generates error comment)', () => {
    const asm = compileOk(`
      void main(void) {
        int x = nonexistent_func();
        halt();
      }
    `);
    expect(asm).toContain('; ERROR: undefined function');
  });

  it('reports parse error for missing semicolon', () => {
    const result = compile(`
      void main(void) {
        int x = 5
        halt();
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.assembly).toBe('');
  });

  it('reports parse error for unexpected token', () => {
    const result = compile(`
      void main(void) {
        *** invalid syntax ***;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.assembly).toBe('');
  });

  it('reports parse error for mismatched braces', () => {
    const result = compile(`
      void main(void) {
        if (1) {
          halt();
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.assembly).toBe('');
  });

  it('reports parse error for invalid type keyword', () => {
    const result = compile(`
      float main(void) {
        halt();
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.assembly).toBe('');
  });
});
