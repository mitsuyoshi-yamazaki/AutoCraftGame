// Replicator — simplified self-replicating character program
// State machine with halt() between each tick

#define ENERGY_LOW      200
#define ENERGY_SAFE     1000
#define PROGRAM_SIZE    512

#define assemble_full(fr,act,har,cha,asm_,proc,sen,dis,mem) \
    (assemble_ext(sen,dis,mem), assemble(fr,act,har,cha,asm_,proc))

int state = 0;
int target_angle = 0;
int move_counter = 0;
int harvest_count = 0;

void main(void) {
    while (1) {
        int energy = my_energy();

        // Priority: recharge if low energy
        if (energy < ENERGY_LOW) {
            int n = sense(FILTER_ENERGY);
            if (n > 0) {
                sense_select(0);
                int dist = sense_distance();
                if (dist < 2) {
                    recharge();
                } else {
                    move(sense_angle());
                }
            } else {
                move(energy % 360);
            }
            halt();
            continue;
        }

        // State machine
        if (state == 0) {
            // SENSE for resources
            int n = sense(FILTER_RESOURCE);
            if (n > 0) {
                sense_select(0);
                target_angle = sense_angle();
                int dist = sense_distance();
                if (dist < 2) {
                    state = 2;
                } else {
                    state = 1;
                    move_counter = 0;
                }
            } else {
                // Wander
                target_angle = energy % 360;
                state = 1;
                move_counter = 0;
            }
        } else if (state == 1) {
            // MOVE toward target
            move(target_angle);
            move_counter = move_counter + 1;
            if (move_counter > 5) {
                state = 0;
            }
        } else if (state == 2) {
            // HARVEST
            harvest();
            harvest_count = harvest_count + 1;
            // After several harvests, try to replicate
            if (harvest_count > 20) {
                state = 3;
            } else {
                state = 0;
            }
        } else if (state == 3) {
            // PROCESS + CRAFT + ASSEMBLE
            process(RECIPE_METAL);
            process(RECIPE_CIRCUIT);
            craft(COMP_FRAME);
            craft(COMP_FRAME);
            craft(COMP_FRAME);
            craft(COMP_ACTUATOR);
            craft(COMP_HARVESTER);
            craft(COMP_CHARGER);
            craft(COMP_ASSEMBLER);
            craft(COMP_PROCESSOR);
            craft(COMP_SENSOR);
            craft(COMP_MEMORYCORE);

            assemble_ext(1, 0, 1);
            int child = assemble(3, 1, 1, 1, 1, 1);
            write_memory(child, 0, 0, PROGRAM_SIZE);
            activate(child);

            harvest_count = 0;
            state = 0;
        } else {
            state = 0;
        }

        halt();
    }
}
