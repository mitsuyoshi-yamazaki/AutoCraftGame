# AutoCraftGame v9

v9 is a deterministic 2D simulation in which self-replicating "organisms" are nothing but
programs running on crafted machines. The world provides only physics — per-atom-type
conservation of matter, energy, force and motion, connections between parts, and memory
read/write I/O — and knows nothing about individuals, species, mutation or evolution.
There are 8 component types (Processor, Assembler, Storage, Harvester, Sensor, Actuator,
Disassembler, MemoryCore). A Processor runs a 16-bit von Neumann VM whose program memory
(4,096 words) is also what gets copied into offspring. Every run is fully determined by its
seed.

Most documents in this repository are written in Japanese. This page is the English entry
point for checking the claims made about v9.

## Claims and where to check them

| Claim | Evidence |
|---|---|
| A hand-written ancestor program of 600 words (518 code + 13 materials + 61 craft + 8 dowry; 641 with the optional mutation block) builds a complete copy of itself and boots it | [src/programs/ancestor.ts](src/programs/ancestor.ts) (memory map: `ANCESTOR_LAYOUT`; table sizes include their 0 terminator), [docs/experiments/01](docs/experiments/01_ancestor_replication.md) (size, cycle timing) |
| Mutation is written by the program, not provided by the system (an in-program LCG flips one bit in the child's copy only) | mutation block in [src/programs/ancestor.ts](src/programs/ancestor.ts) (`options.mutation`), [docs/experiments/03](docs/experiments/03_mutation_lineage.md) (surviving mutants in 2 of 5 lineages, seed 42) |
| A predator program hunts other organisms by disassembling them | [src/programs/predator.ts](src/programs/predator.ts), [docs/experiments/02](docs/experiments/02_predation.md) |
| Growth (self-expansion) and self-repair are separate programs on the same physics | [src/programs/expander.ts](src/programs/expander.ts), [src/programs/repairer.ts](src/programs/repairer.ts), [docs/experiments/04](docs/experiments/04_expansion_and_repair.md) |
| A mobile replicator needed ~1,400 words of code, so program memory was enlarged from 1,024 to 4,096 words | [src/programs/mobile.ts](src/programs/mobile.ts), [docs/experiments/06](docs/experiments/06_mobile_replication.md) |
| Mobile vs. sessile competition is decided by the seed: mobile ahead in 3 of 5 seeds, sessile in 2 | [src/programs/competition-config.ts](src/programs/competition-config.ts), [docs/experiments/07](docs/experiments/07_spatial_competition.md) |
| Maintaining organs (repairing before they wear out) makes the same 6-part body live 2.4–3.3× longer and leave more offspring | [src/programs/longevous.ts](src/programs/longevous.ts), [docs/experiments/08](docs/experiments/08_longevous_replication.md) |
| The recording (birth → growth → depletion → death → decay → reclaim) is a replayable run, and its captions are computed ahead of time | experiment `recording` in [src/experiments.ts](src/experiments.ts) (seed 5, resource-poor world), [src/tools/recording-script.ts](src/tools/recording-script.ts), [ui/recording-captions.json](ui/recording-captions.json) |

The overall conclusion (in Japanese) is [docs/CONCLUSION.md](docs/CONCLUSION.md).
Experiment 09 (evolution search) was stopped partway at the author's decision and is not
part of the claims above.

## Running it

Requires Node.js (checked with Node 24).

```bash
cd v9
npm ci
npm test                                             # 20 test files, 115 tests (about 40 s)
npm run ui                                           # browser viewer for all experiments
```

Reproduce individual runs (the seed fixes the whole run):

```bash
npm run sim -- --ancestor --ticks 3000 --seed 42           # experiment 01
npm run sim -- --ancestor-mutate --ticks 3000 --seed 42    # 01 with the in-program mutation
npm run sim -- --predation --ticks 3000 --seed 42          # experiment 02
npm run sim -- --mobile --ticks 3000 --seed 42             # experiment 06
npm run sim -- --competition --ticks 12000 --seed 2        # experiment 07 (seeds 42, 1, 2, 7, 11 in the doc)
npm run sim -- --longevous --ticks 20000 --seed 26         # experiment 08 (4 ancestors)
```

Regenerate the recording captions and compare them with the committed file:

```bash
npm run recording:script -- --seed 5 --ticks 12000 --out /tmp/captions.json
```

Without `--out`, the tool overwrites `ui/recording-captions.json`. The committed file was
generated at game version 9.5.12. The caption entries are the same as those first generated
at 9.5.9.

## Determinism

The simulation uses only a seeded PRNG. Tests run the same seed twice and require
identical results, including runs with mutation, predation and competition
([test/ancestor.test.ts](test/ancestor.test.ts), [test/ecology.test.ts](test/ecology.test.ts),
[test/competition.test.ts](test/competition.test.ts), [test/longevous.test.ts](test/longevous.test.ts)).
Conservation of every atom type is also checked by the tests.

## Earlier versions

v1–v8 are earlier, independent attempts. Each one tested one idea and ran into a limit that
shaped the next version. For example, v7 copied programs perfectly with no way to mutate, and
in v8 programs could not rewrite themselves. v9 is the first version that meets the project's
goal. A one-line summary of each version is in [../docs/versions.md](../docs/versions.md)
(Japanese).

## License

MIT ([../LICENSE](../LICENSE)). The UI uses ColorBrewer and viridis-family color data;
attribution is in [../NOTICE](../NOTICE).
