// Scavenger v4 — patient scavenger with Frame×3 for durability, with repair
// Components: Frame×3, Actuator, Disassembler, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Strategy: stay near energy nodes, only move when remains detected or recharging

#define ENERGY_ENTER_RECHARGE  1500
#define ENERGY_EXIT_RECHARGE   3000
#define ENERGY_ASSEMBLE        800
#define DURABILITY_REPAIR_ENTER 2000
#define DURABILITY_REPAIR_EXIT  5000
#define METAL_NEEDED    15
#define CIRCUIT_NEEDED  14
#define DISASSEMBLE_STEPS 20
#define COPY_SIZE       1500
#define CRAFT_STEPS     11

int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int target_id = 0;
int disassemble_count = 0;
int repairing = 0;
int idle_count = 0;

void main(void) {
    while (1) {
        int energy = my_energy();
        int durability = my_durability();

        // Hysteresis recharge (top priority, high thresholds to stay topped up)
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
                    wander_angle = wander_angle + 45;
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

        // Find and disassemble remains
        if (phase == 0) {
            int ore = inventory_count(0);
            int crystal = inventory_count(1);
            int metal = inventory_count(2);
            int circuit = inventory_count(3);
            int total_metal = metal + ore / 2;
            int total_circuit = circuit + crystal / 2;
            if (total_metal >= METAL_NEEDED && total_circuit >= CIRCUIT_NEEDED) {
                phase = 1;
                count = 0;
                if (target_id != 0) { release_id(target_id); }
                target_id = 0;
                disassemble_count = 0;
                halt();
                continue;
            }
            // Find remains
            int n = sense(FILTER_REMAINS);
            if (n > 0) {
                idle_count = 0;
                sense_select(0);
                if (sense_distance() < 2) {
                    if (target_id == 0) {
                        target_id = sense_register();
                    }
                    disassemble(target_id);
                    disassemble_count = disassemble_count + 1;
                    if (disassemble_count >= DISASSEMBLE_STEPS) {
                        if (target_id != 0) { release_id(target_id); }
                        target_id = 0;
                        disassemble_count = 0;
                    }
                } else {
                    move(sense_angle());
                }
            } else {
                // No remains — idle near energy (don't wander aimlessly)
                idle_count = idle_count + 1;
                if (idle_count > 20) {
                    // Occasionally move to find new area
                    wander_angle = wander_angle + 45;
                    move(wander_angle);
                    idle_count = 0;
                }
                // Otherwise just sit and wait (saves energy)
            }
            halt();
            continue;
        }

        // Process metal from ore
        if (phase == 1) {
            int metal = inventory_count(2);
            if (metal >= METAL_NEEDED) { phase = 2; count = 0; }
            else {
                int ore = inventory_count(0);
                if (ore >= 2) { process(RECIPE_METAL); }
                else { phase = 2; count = 0; }
            }
            halt();
            continue;
        }

        // Process circuit from crystal
        if (phase == 2) {
            int circuit = inventory_count(3);
            if (circuit >= CIRCUIT_NEEDED) { phase = 3; craft_step = 0; }
            else {
                int crystal = inventory_count(1);
                if (crystal >= 2) { process(RECIPE_CIRCUIT); }
                else { phase = 3; craft_step = 0; }
            }
            halt();
            continue;
        }

        // Craft: 0-2=Frame, 3=Actuator, 4=Disassembler, 5=Charger, 6=Assembler, 7=Processor, 8=Sensor, 9-10=MemoryCore
        if (phase == 3) {
            if (craft_step >= CRAFT_STEPS) { phase = 4; }
            else {
                if (craft_step < 3) { craft(COMP_FRAME); }
                else if (craft_step == 3) { craft(COMP_ACTUATOR); }
                else if (craft_step == 4) { craft(COMP_DISASSEMBLER); }
                else if (craft_step == 5) { craft(COMP_CHARGER); }
                else if (craft_step == 6) { craft(COMP_ASSEMBLER); }
                else if (craft_step == 7) { craft(COMP_PROCESSOR); }
                else if (craft_step == 8) { craft(COMP_SENSOR); }
                else { craft(COMP_MEMORYCORE); }
                craft_step = craft_step + 1;
            }
            halt();
            continue;
        }

        // Assemble + Write
        if (phase == 4) {
            if (energy < ENERGY_ASSEMBLE) {
                int n = sense(FILTER_ENERGY);
                if (n > 0) {
                    sense_select(0);
                    if (sense_distance() < 2) { recharge(); }
                    else { move(sense_angle()); }
                } else {
                    wander_angle = wander_angle + 45;
                    move(wander_angle);
                }
            } else {
                phase = 5;
                count = 0;
                craft_step = 0;
                recharging = 0;
                repairing = 0;
                child_id = 0;
                target_id = 0;
                disassemble_count = 0;
                idle_count = 0;
                assemble_ext(1, 1, 2);
                child_id = assemble(3, 1, 0, 1, 1, 1);
                write_memory(child_id, 0, 0, COPY_SIZE);
            }
            halt();
            continue;
        }

        // Activate child
        if (phase == 5) {
            activate(child_id);
            phase = 0;
            child_id = 0;
            halt();
            continue;
        }

        halt();
    }
}
