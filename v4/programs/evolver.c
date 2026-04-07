// Evolver — self-replicator with parameter mutation
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Strategy: Pioneer-based behavior with evolvable parameters
// On replication, parameters are mutated slightly before write_memory, then restored.

#define COPY_SIZE       1700

// === Evolvable parameters (globals, copied to child via write_memory) ===
int param_recharge_enter = 250;
int param_recharge_exit = 700;
int param_repair_enter = 2000;
int param_repair_exit = 4000;
int param_assemble_energy = 700;
int param_wander_step = 90;
int param_frame_count = 2;

// === RNG state ===
int rng_state = 0;

// === Working state ===
int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int repairing = 0;

// --- PRNG (16-bit LCG) ---
int next_rng(void) {
    rng_state = rng_state * 25173 + 13849;
    return rng_state;
}

// --- Clamp value to [lo, hi] ---
int clamp(int val, int lo, int hi) {
    if (val < lo) { return lo; }
    if (val > hi) { return hi; }
    return val;
}

// --- Mutate: add random delta in [-half_range, +half_range], clamp to [lo, hi] ---
int mutate(int value, int half_range, int lo, int hi) {
    int raw = next_rng() % (half_range * 2 + 1);
    int delta = raw - half_range;
    return clamp(value + delta, lo, hi);
}

// --- Dynamic material calculation based on param_frame_count ---
int calc_metal_needed(void) {
    // Frame=3metal each, Actuator=1M+1C, Harvester=2M, Charger=1M+2C,
    // Assembler=2M+1C, Processor=3C, Sensor=2C, MemoryCore=2C×2
    // Metal total: frame_count*3 + 1 + 2 + 1 + 2 = frame_count*3 + 6
    return param_frame_count * 3 + 6;
}

int calc_circuit_needed(void) {
    // Circuit total: 1 + 2 + 1 + 3 + 2 + 2*2 = 13 (Frame-independent)
    return 13;
}

int calc_ore_needed(void) {
    return calc_metal_needed() * 2;
}

int calc_crystal_needed(void) {
    return calc_circuit_needed() * 2;
}

int calc_craft_steps(void) {
    // Frame×N + Actuator + Harvester + Charger + Assembler + Processor + Sensor + MemoryCore×2
    return param_frame_count + 8;
}

void do_recharge(void) {
    int n = sense(FILTER_ENERGY);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) { recharge(); }
        else { move(sense_angle()); }
    } else {
        wander_angle = wander_angle + param_wander_step;
        move(wander_angle);
    }
}

void do_harvest(int filter) {
    int n = sense(filter);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) {
            harvest();
            count = count + 1;
        } else { move(sense_angle()); }
    } else {
        wander_angle = wander_angle + param_wander_step;
        move(wander_angle);
    }
}

void do_craft(void) {
    // Craft in order: Frame×N, then fixed components
    int non_frame = craft_step - param_frame_count;
    if (craft_step < param_frame_count) {
        craft(COMP_FRAME);
    } else if (non_frame == 0) { craft(COMP_ACTUATOR); }
    else if (non_frame == 1) { craft(COMP_HARVESTER); }
    else if (non_frame == 2) { craft(COMP_CHARGER); }
    else if (non_frame == 3) { craft(COMP_ASSEMBLER); }
    else if (non_frame == 4) { craft(COMP_PROCESSOR); }
    else if (non_frame == 5) { craft(COMP_SENSOR); }
    else { craft(COMP_MEMORYCORE); }
    craft_step = craft_step + 1;
}

void do_replicate(void) {
    // Seed RNG from current tick
    rng_state = current_tick();

    // 1. Save current params
    int sv_re = param_recharge_enter;
    int sv_rx = param_recharge_exit;
    int sv_rpe = param_repair_enter;
    int sv_rpx = param_repair_exit;
    int sv_ae = param_assemble_energy;
    int sv_ws = param_wander_step;
    int sv_fc = param_frame_count;

    // 2. Mutate for child
    param_recharge_enter = mutate(param_recharge_enter, 30, 100, 600);
    param_recharge_exit = mutate(param_recharge_exit, 50, 400, 1500);
    param_repair_enter = mutate(param_repair_enter, 200, 500, 4000);
    param_repair_exit = mutate(param_repair_exit, 300, 2000, 8000);
    param_assemble_energy = mutate(param_assemble_energy, 50, 400, 1500);
    param_wander_step = mutate(param_wander_step, 15, 15, 180);
    param_frame_count = mutate(param_frame_count, 1, 1, 4);

    // 3. Assemble child + write mutated memory
    assemble_ext(1, 0, 2);
    child_id = assemble(sv_fc, 1, 1, 1, 1, 1);
    write_memory(child_id, 0, 0, COPY_SIZE);

    // 4. Restore parent params
    param_recharge_enter = sv_re;
    param_recharge_exit = sv_rx;
    param_repair_enter = sv_rpe;
    param_repair_exit = sv_rpx;
    param_assemble_energy = sv_ae;
    param_wander_step = sv_ws;
    param_frame_count = sv_fc;
}

void main(void) {
    while (1) {
        int energy = my_energy();
        int durability = my_durability();

        // Hysteresis recharge (top priority)
        if (recharging == 0) {
            if (energy < param_recharge_enter) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > param_recharge_exit) {
                recharging = 0;
            } else {
                do_recharge();
                halt();
                continue;
            }
        }

        // Hysteresis repair (second priority)
        if (repairing == 0) {
            if (durability < param_repair_enter) { repairing = 1; }
        }
        if (repairing == 1) {
            if (durability > param_repair_exit) {
                repairing = 0;
            } else {
                repair();
                halt();
                continue;
            }
        }

        // Phase 0: Gather ore
        if (phase == 0) {
            if (count >= calc_ore_needed()) {
                phase = 1; count = 0; halt(); continue;
            }
            do_harvest(FILTER_ORE);
            halt(); continue;
        }

        // Phase 1: Gather crystal
        if (phase == 1) {
            if (count >= calc_crystal_needed()) {
                phase = 2; count = 0; halt(); continue;
            }
            do_harvest(FILTER_CRYSTAL);
            halt(); continue;
        }

        // Phase 2: Process metal
        if (phase == 2) {
            if (count >= calc_metal_needed()) { phase = 3; count = 0; }
            else { process(RECIPE_METAL); count = count + 1; }
            halt(); continue;
        }

        // Phase 3: Process circuit
        if (phase == 3) {
            if (count >= calc_circuit_needed()) { phase = 4; craft_step = 0; }
            else { process(RECIPE_CIRCUIT); count = count + 1; }
            halt(); continue;
        }

        // Phase 4: Craft components
        if (phase == 4) {
            if (craft_step >= calc_craft_steps()) { phase = 5; }
            else { do_craft(); }
            halt(); continue;
        }

        // Phase 5: Assemble + Write (wait for enough energy)
        if (phase == 5) {
            if (energy < param_assemble_energy) {
                do_recharge();
            } else {
                phase = 6;
                count = 0; craft_step = 0;
                recharging = 0; repairing = 0; child_id = 0;
                do_replicate();
            }
            halt(); continue;
        }

        // Phase 6: Activate child
        if (phase == 6) {
            activate(child_id);
            phase = 0; child_id = 0;
            halt(); continue;
        }

        halt();
    }
}
