// Replicator v6 — all globals, no stack leak
// Components: Frame×3, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Resources: Ore×30 → Metal×15, Crystal×26 → Circuit×13

#define ENERGY_ENTER_RECHARGE  200
#define ENERGY_EXIT_RECHARGE   600
#define ENERGY_ASSEMBLE        700
#define ORE_NEEDED      30
#define CRYSTAL_NEEDED  26
#define METAL_NEEDED    15
#define CIRCUIT_NEEDED  13
#define COPY_SIZE       1200
#define CRAFT_STEPS     11

// All variables are global to avoid stack leak with halt()/continue
int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int energy = 0;
int n = 0;

void main(void) {
    while (1) {
        energy = my_energy();

        // Hysteresis recharge
        if (recharging == 0) {
            if (energy < ENERGY_ENTER_RECHARGE) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > ENERGY_EXIT_RECHARGE) {
                recharging = 0;
            } else {
                n = sense(FILTER_ENERGY);
                if (n > 0) {
                    sense_select(0);
                    if (sense_distance() < 2) { recharge(); }
                    else { move(sense_angle()); }
                } else {
                    wander_angle = wander_angle + 45;
                    move(wander_angle);
                }
                halt();
                continue;
            }
        }

        // Gather ore
        if (phase == 0) {
            if (count >= ORE_NEEDED) {
                phase = 1;
                count = 0;
                halt();
                continue;
            }
            n = sense(FILTER_ORE);
            if (n > 0) {
                sense_select(0);
                if (sense_distance() < 2) {
                    harvest();
                    count = count + 1;
                } else { move(sense_angle()); }
            } else {
                wander_angle = wander_angle + 45;
                move(wander_angle);
            }
            halt();
            continue;
        }

        // Gather crystal
        if (phase == 1) {
            if (count >= CRYSTAL_NEEDED) {
                phase = 2;
                count = 0;
                halt();
                continue;
            }
            n = sense(FILTER_CRYSTAL);
            if (n > 0) {
                sense_select(0);
                if (sense_distance() < 2) {
                    harvest();
                    count = count + 1;
                } else { move(sense_angle()); }
            } else {
                wander_angle = wander_angle + 45;
                move(wander_angle);
            }
            halt();
            continue;
        }

        // Process metal
        if (phase == 2) {
            if (count >= METAL_NEEDED) { phase = 3; count = 0; }
            else { process(RECIPE_METAL); count = count + 1; }
            halt();
            continue;
        }

        // Process circuit
        if (phase == 3) {
            if (count >= CIRCUIT_NEEDED) { phase = 4; craft_step = 0; }
            else { process(RECIPE_CIRCUIT); count = count + 1; }
            halt();
            continue;
        }

        // Craft
        if (phase == 4) {
            if (craft_step >= CRAFT_STEPS) { phase = 5; }
            else {
                if (craft_step < 3) { craft(COMP_FRAME); }
                else if (craft_step < 9) { craft(craft_step - 2); }
                else { craft(COMP_MEMORYCORE); }
                craft_step = craft_step + 1;
            }
            halt();
            continue;
        }

        // Assemble + Write
        if (phase == 5) {
            if (energy < ENERGY_ASSEMBLE) {
                n = sense(FILTER_ENERGY);
                if (n > 0) {
                    sense_select(0);
                    if (sense_distance() < 2) { recharge(); }
                    else { move(sense_angle()); }
                } else {
                    wander_angle = wander_angle + 45;
                    move(wander_angle);
                }
            } else {
                // Reset globals BEFORE write
                phase = 6;
                count = 0;
                craft_step = 0;
                recharging = 0;
                child_id = 0;
                n = 0;
                // Assemble (Assembler slot) + Write (Processor slot)
                assemble_ext(1, 0, 2);
                child_id = assemble(3, 1, 1, 1, 1, 1);
                write_memory(child_id, 0, 0, COPY_SIZE);
            }
            halt();
            continue;
        }

        // Activate child (separate tick)
        if (phase == 6) {
            activate(child_id);
            phase = 0;
            halt();
            continue;
        }

        halt();
    }
}
