// Guardian — survival/replication-priority species
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
//
// Strategy:
// - Always keep energy topped off (high recharge thresholds)
// - Flee from crowds (3+ active characters nearby) when energy is sufficient
// - Never wander aimlessly: only move when there is a concrete purpose
//   (recharge target visible, harvest target visible, or fleeing crowd)

#define ENERGY_RECHARGE_ENTER  1000
#define ENERGY_RECHARGE_EXIT   1100
#define ENERGY_ASSEMBLE         900
#define DURABILITY_REPAIR_ENTER 500
#define DURABILITY_REPAIR_EXIT  1100
#define ORE_NEEDED      24
#define CRYSTAL_NEEDED  26
#define METAL_NEEDED    12
#define CIRCUIT_NEEDED  13
#define COPY_SIZE       1900
#define CRAFT_STEPS     10
#define RECHARGE_AMOUNT 400
#define CROWD_THRESHOLD 3

int phase = 0;
int count = 0;
int craft_step = 0;
int child_id = 0;
int recharging = 0;
int repairing = 0;
int move_target = 0;

void do_recharge_smart(void) {
    // Continue toward stored target if any
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
            // Adjacent — but check the node still has enough energy
            if (sense_amount() < RECHARGE_AMOUNT && n > 1) {
                // Switch to next nearest energy node
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
    }
    // No energy node visible — stay put (no wandering)
}

// Returns 1 if a flee move was issued, 0 otherwise.
int try_flee_crowd(void) {
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n < CROWD_THRESHOLD) { return 0; }
    // Move opposite to the nearest crowding character.
    sense_select(0);
    int away = sense_angle() + 180;
    if (away >= 360) { away = away - 360; }
    move(away);
    return 1;
}

void do_harvest(int filter) {
    int n = sense(filter);
    if (n > 0) {
        sense_select(0);
        if (sense_distance() < 2) { harvest(); count = count + 1; }
        else { move(sense_angle()); }
    }
    // No resource visible — stay put (no wandering)
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

void main(void) {
    while (1) {
        int energy = my_energy();
        int durability = my_durability();

        // Always keep energy topped off (hysteresis)
        if (recharging == 0) {
            if (energy < ENERGY_RECHARGE_ENTER) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > ENERGY_RECHARGE_EXIT) {
                recharging = 0;
            } else {
                do_recharge_smart();
                halt(); continue;
            }
        }

        // Energy is sufficient: flee from crowd if any
        if (try_flee_crowd()) {
            halt(); continue;
        }

        // Hysteresis repair
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

        if (phase == 5) {
            if (energy < ENERGY_ASSEMBLE) {
                do_recharge_smart();
            } else {
                phase = 6; count = 0; craft_step = 0;
                recharging = 0; repairing = 0; child_id = 0; move_target = 0;
                assemble_ext(1, 0, 2);
                child_id = assemble(2, 1, 1, 1, 1, 1);
                write_memory(child_id, 0, 0, COPY_SIZE);
            }
            halt(); continue;
        }

        if (phase == 6) {
            activate(child_id);
            phase = 0; child_id = 0;
            halt(); continue;
        }

        halt();
    }
}
