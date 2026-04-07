// Pioneer v2 — fast-replicator with repair, wider wander angle
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Strategy: moderate thresholds, wider wandering pattern (90° steps)

#define ENERGY_ENTER_RECHARGE  250
#define ENERGY_EXIT_RECHARGE   700
#define ENERGY_ASSEMBLE        700
#define DURABILITY_REPAIR_ENTER 400
#define DURABILITY_REPAIR_EXIT  800
#define ORE_NEEDED      24
#define CRYSTAL_NEEDED  26
#define METAL_NEEDED    12
#define CIRCUIT_NEEDED  13
#define COPY_SIZE       1400
#define CRAFT_STEPS     10

int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int repairing = 0;

void main(void) {
    while (1) {
        int energy = my_energy();
        int durability = my_durability();

        // Hysteresis recharge
        if (recharging == 0) {
            if (energy < ENERGY_ENTER_RECHARGE) { recharging = 1; }
        }
        if (recharging == 1) {
            if (energy > ENERGY_EXIT_RECHARGE) {
                recharging = 0;
            } else {
                int n = sense(FILTER_ENERGY);
                if (n > 0) {
                    sense_select(0);
                    if (sense_distance() < 2) { recharge(); }
                    else { move(sense_angle()); }
                } else {
                    wander_angle = wander_angle + 90;
                    move(wander_angle);
                }
                halt();
                continue;
            }
        }

        // Hysteresis repair
        if (repairing == 0) {
            if (durability < DURABILITY_REPAIR_ENTER) { repairing = 1; }
        }
        if (repairing == 1) {
            if (durability > DURABILITY_REPAIR_EXIT) {
                repairing = 0;
            } else {
                repair();
                halt();
                continue;
            }
        }

        if (phase == 0) {
            if (count >= ORE_NEEDED) { phase = 1; count = 0; halt(); continue; }
            int n = sense(FILTER_ORE);
            if (n > 0) {
                sense_select(0);
                if (sense_distance() < 2) { harvest(); count = count + 1; }
                else { move(sense_angle()); }
            } else { wander_angle = wander_angle + 90; move(wander_angle); }
            halt(); continue;
        }

        if (phase == 1) {
            if (count >= CRYSTAL_NEEDED) { phase = 2; count = 0; halt(); continue; }
            int n = sense(FILTER_CRYSTAL);
            if (n > 0) {
                sense_select(0);
                if (sense_distance() < 2) { harvest(); count = count + 1; }
                else { move(sense_angle()); }
            } else { wander_angle = wander_angle + 90; move(wander_angle); }
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
            else {
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
            halt(); continue;
        }

        if (phase == 5) {
            if (energy < ENERGY_ASSEMBLE) {
                int n = sense(FILTER_ENERGY);
                if (n > 0) {
                    sense_select(0);
                    if (sense_distance() < 2) { recharge(); }
                    else { move(sense_angle()); }
                } else { wander_angle = wander_angle + 90; move(wander_angle); }
            } else {
                phase = 6; count = 0; craft_step = 0;
                recharging = 0; repairing = 0; child_id = 0;
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
