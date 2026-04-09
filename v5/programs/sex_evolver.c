// SexEvolver — sexual replicator with parameter mutation and inactive code paths.
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×3
// Memory: 3072 words.
//
// Same structure as AsexEvolver but uses cross_write when a mate is found
// (within interactRange). Falls back to write_memory when alone.

#define COPY_SIZE 2700

int wander_step = 90;
int recharge_low = 350;
int recharge_high = 1100;
int ore_target = 24;
int crystal_target = 34;
int behavior_mode = 0;

int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int repairing = 0;
int child_id = 0;
int mate_id = 0;
int rng_state = 27182;
int move_target = 0;

int next_rand(void) {
    rng_state = rng_state * 1103515245;
    rng_state = rng_state + 12345;
    rng_state = rng_state & 32767;
    return rng_state;
}

void do_wander(void) {
    wander_angle = wander_angle + wander_step;
    move(wander_angle);
}

void do_recharge(void) {
    if (move_target != 0) {
        int t = sense_id(move_target);
        if (t == 0) {
            move_target = 0;
        } else if (sense_distance() < 2) {
            move_target = 0;
            recharge();
            return;
        } else {
            move(sense_angle());
            return;
        }
    }
    int n = sense(FILTER_ENERGY);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) {
            recharge();
        } else {
            move_target = sense_register();
            move(sense_angle());
        }
    } else { do_wander(); }
}

void do_harvest(int filter) {
    int n = sense(filter);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) { harvest(); count = count + 1; }
        else { move(sense_angle()); }
    } else { do_wander(); }
}

void do_craft(void) {
    if (craft_step < 2) { craft(COMP_FRAME); }
    else if (craft_step == 2) { craft(COMP_ACTUATOR); }
    else if (craft_step == 3) { craft(COMP_HARVESTER); }
    else if (craft_step == 4) { craft(COMP_CHARGER); }
    else if (craft_step == 5) { craft(COMP_ASSEMBLER); }
    else if (craft_step == 6) { craft(COMP_PROCESSOR); }
    else if (craft_step == 7) { craft(COMP_SENSOR); }
    else { craft(COMP_MEMORYCORE); }
    craft_step = craft_step + 1;
}

// === Inactive code paths ===
void mode_aggressive_recharge(void) {
    do_recharge();
}

void mode_seek_mate(void) {
    // Actively moves toward nearest active character
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n > 0) {
        sense_select(0);
        move(sense_angle());
    } else {
        do_wander();
    }
}

void mode_share_resources(void) {
    // Inactive: tries to find another character and "share" via approach
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) {
            harvest();
        } else {
            move(sense_angle());
        }
    } else {
        do_wander();
    }
}

int find_mate(void) {
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n == 0) { return 0; }
    sense_select(0);
    if (sense_distance() < 2) {
        return sense_register();
    }
    return 0;
}

void do_replicate(void) {
    int s_wander = wander_step;
    int s_rl = recharge_low;
    int s_rh = recharge_high;
    int s_ot = ore_target;
    int s_ct = crystal_target;
    int s_bm = behavior_mode;
    int s_rng = rng_state;

    int r = next_rand();
    if ((r & 31) == 0) {
        behavior_mode = next_rand() & 3;
    }
    wander_step = wander_step + (next_rand() & 31) - 15;
    if (wander_step < 30) { wander_step = 30; }
    if (wander_step > 180) { wander_step = 180; }
    ore_target = ore_target + (next_rand() & 3) - 1;
    if (ore_target < 20) { ore_target = 20; }
    if (ore_target > 32) { ore_target = 32; }
    crystal_target = crystal_target + (next_rand() & 3) - 1;
    if (crystal_target < 28) { crystal_target = 28; }
    if (crystal_target > 40) { crystal_target = 40; }
    rng_state = next_rand();

    assemble_ext(1, 0, 4);
    child_id = assemble(2, 1, 1, 1, 1, 1);

    // Try sexual reproduction; fall back to asexual
    mate_id = find_mate();
    if (mate_id == 0) {
        write_memory(child_id, 0, 0, COPY_SIZE);
    } else {
        cross_write(child_id, mate_id, 0, 0, COPY_SIZE);
    }

    wander_step = s_wander;
    recharge_low = s_rl;
    recharge_high = s_rh;
    ore_target = s_ot;
    crystal_target = s_ct;
    behavior_mode = s_bm;
    rng_state = s_rng;
}

void main(void) {
    while (1) {
        checkpoint();
        int energy = my_energy();
        int durability = my_durability();

        if (recharging == 0) {
            if (energy < recharge_low) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > recharge_high) {
                recharging = 0;
            } else {
                do_recharge();
                halt(); continue;
            }
        }

        if (repairing == 0) {
            if (durability < 400) { repairing = 1; }
        }
        if (repairing == 1) {
            if (durability > 800) {
                repairing = 0;
            } else {
                repair(); halt(); continue;
            }
        }

        if (behavior_mode == 1) {
            mode_aggressive_recharge();
            halt(); continue;
        }
        if (behavior_mode == 2) {
            mode_seek_mate();
            halt(); continue;
        }
        if (behavior_mode == 3) {
            mode_share_resources();
            halt(); continue;
        }

        if (phase == 0) {
            if (count >= ore_target) { phase = 1; count = 0; halt(); continue; }
            do_harvest(FILTER_ORE);
            halt(); continue;
        }
        if (phase == 1) {
            if (count >= crystal_target) { phase = 2; count = 0; halt(); continue; }
            do_harvest(FILTER_CRYSTAL);
            halt(); continue;
        }
        if (phase == 2) {
            if (count >= 12) { phase = 3; count = 0; halt(); continue; }
            process(RECIPE_METAL); count = count + 1;
            halt(); continue;
        }
        if (phase == 3) {
            if (count >= 17) { phase = 4; craft_step = 0; halt(); continue; }
            process(RECIPE_CIRCUIT); count = count + 1;
            halt(); continue;
        }
        if (phase == 4) {
            if (craft_step >= 12) { phase = 5; halt(); continue; }
            do_craft();
            halt(); continue;
        }
        if (phase == 5) {
            if (energy < 1100) {
                do_recharge();
            } else {
                do_replicate();
                phase = 6;
            }
            halt(); continue;
        }
        if (phase == 6) {
            activate(child_id);
            phase = 0; count = 0; craft_step = 0; child_id = 0; mate_id = 0; move_target = 0;
            halt(); continue;
        }
        halt();
    }
}
