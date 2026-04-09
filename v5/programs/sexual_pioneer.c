// SexualPioneer — pioneer that uses CROSS_WRITE for sexual reproduction.
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Strategy: Same as pioneer but in phase 5, find a nearby active mate and cross_write
// the child memory using both parents' memory blocks.

#define ENERGY_ENTER_RECHARGE  250
#define ENERGY_EXIT_RECHARGE   700
#define ENERGY_ASSEMBLE        700
#define ENERGY_EXPLORE         700
#define DURABILITY_REPAIR_ENTER 400
#define DURABILITY_REPAIR_EXIT  800
#define ORE_NEEDED      24
#define CRYSTAL_NEEDED  26
#define METAL_NEEDED    12
#define CIRCUIT_NEEDED  13
#define COPY_SIZE       1900
#define CRAFT_STEPS     10
#define WANDER_STEP     90
#define RECHARGE_AMOUNT 400

int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int repairing = 0;
int move_target = 0;
int mate_id = 0;

void do_wander(void) {
    wander_angle = wander_angle + WANDER_STEP;
    move(wander_angle);
}

void do_recharge(void) {
    if (move_target != 0) {
        int type = sense_id(move_target);
        if (type == 0) { move_target = 0; }
        else if (sense_distance() < 2) { move_target = 0; recharge(); return; }
        else { move(sense_angle()); return; }
    }
    int n = sense(FILTER_ENERGY);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) {
            if (sense_amount() < RECHARGE_AMOUNT && n > 1) {
                sense_select(1);
                move_target = sense_register();
                recharge();
                move(sense_angle());
            } else {
                recharge();
            }
        } else {
            move(sense_angle());
        }
    } else {
        do_wander();
    }
}

void do_harvest(int filter) {
    int n = sense(filter);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) { harvest(); count = count + 1; }
        else { move(sense_angle()); }
        return;
    }
    if (move_target != 0) {
        int type = sense_id(move_target);
        if (type == 0) { move_target = 0; }
        else if (sense_distance() < 2) { move_target = 0; }
        else { move(sense_angle()); return; }
    }
    int energy = my_energy();
    if (energy > ENERGY_EXPLORE) {
        int n2 = sense(FILTER_ENERGY);
        if (n2 > 0) {
            sense_select(n2 - 1);
            move_target = sense_register();
            move(sense_angle());
        } else { do_wander(); }
    } else {
        int n2 = sense(FILTER_ENERGY);
        if (n2 > 0) {
            sense_select(0);
            if (sense_distance() < 2) { recharge(); }
            else { move(sense_angle()); }
        } else { do_wander(); }
    }
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

// Find a nearby active character (potential mate). Returns local_id or 0.
int find_mate(void) {
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n == 0) { return 0; }
    sense_select(0);
    if (sense_distance() < 2) {
        return sense_register();
    }
    return 0;
}

void main(void) {
    while (1) {
        checkpoint();
        int energy = my_energy();
        int durability = my_durability();

        if (recharging == 0) {
            if (energy < ENERGY_ENTER_RECHARGE) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > ENERGY_EXIT_RECHARGE) {
                recharging = 0;
            } else {
                do_recharge();
                halt(); continue;
            }
        }

        if (repairing == 0) {
            if (durability < DURABILITY_REPAIR_ENTER) { repairing = 1; }
        }
        if (repairing == 1) {
            if (durability > DURABILITY_REPAIR_EXIT) {
                repairing = 0;
            } else {
                repair(); halt(); continue;
            }
        }

        if (phase == 0) {
            if (count >= ORE_NEEDED) { phase = 1; count = 0; halt(); continue; }
            do_harvest(FILTER_ORE);
            halt(); continue;
        }

        if (phase == 1) {
            if (count >= CRYSTAL_NEEDED) { phase = 2; count = 0; halt(); continue; }
            do_harvest(FILTER_CRYSTAL);
            halt(); continue;
        }

        if (phase == 2) {
            if (count >= METAL_NEEDED) { phase = 3; count = 0; }
            else { process(RECIPE_METAL); count = count + 1; }
            halt(); continue;
        }

        if (phase == 3) {
            if (count >= CIRCUIT_NEEDED) { phase = 4; craft_step = 0; }
            else { process(RECIPE_CIRCUIT); count = count + 1; }
            halt(); continue;
        }

        if (phase == 4) {
            if (craft_step >= CRAFT_STEPS) { phase = 5; }
            else { do_craft(); }
            halt(); continue;
        }

        // Phase 5: assemble + find mate + cross_write (or fall back to write_memory)
        if (phase == 5) {
            if (energy < ENERGY_ASSEMBLE) {
                do_recharge();
            } else {
                mate_id = find_mate();
                if (mate_id == 0) {
                    // No mate found; do asexual replication this cycle
                    phase = 6; count = 0; craft_step = 0;
                    recharging = 0; repairing = 0; child_id = 0; move_target = 0;
                    assemble_ext(1, 0, 2);
                    child_id = assemble(2, 1, 1, 1, 1, 1);
                    write_memory(child_id, 0, 0, COPY_SIZE);
                } else {
                    // Sexual replication
                    phase = 6; count = 0; craft_step = 0;
                    recharging = 0; repairing = 0; child_id = 0; move_target = 0;
                    assemble_ext(1, 0, 2);
                    child_id = assemble(2, 1, 1, 1, 1, 1);
                    cross_write(child_id, mate_id, 0, 0, COPY_SIZE);
                }
            }
            halt(); continue;
        }

        if (phase == 6) {
            activate(child_id);
            phase = 0; child_id = 0; mate_id = 0;
            halt(); continue;
        }

        halt();
    }
}
