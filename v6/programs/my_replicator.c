// 本プログラムは手動で実装中のものであり、ClaudeCodeは手を触れるな
// Components: Frame×3, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Resources: Ore×30 → Metal×15, Crystal×26 → Circuit×13

// state: 0:none, 1:seek energy node
int state = 0;
int target = 0;

void seek_energy_node(void) {
  int n = sense(FILTER_ENERGY);
  if (n > 0) {
      sense_select(0);
      if (sense_distance() < 2) { recharge(); }
      else { move(sense_angle()); }
  } else {
      wander_angle = wander_angle + 45;
      move(wander_angle);
  }
}

int set_state(void) {
  int energy = my_energy();
  if (energy < 1000) {
    return 1; // seek energy node
  }
}

void main(void) {
  while (1) {
    if (state == 0) { // none
      target = 0;
      state = set_state();
      continue;
    } else if (state == 1) { // recharge
    }
  }
}


/*

- 状態：大きなタスク
- 小状態：今何のアクションを行うか

- 状態の決定
  - energy < 1000 → 状態：recharge
- 状態：recharge
  - エネルギーノードIDがない
    - 探す
    - 見つからない → 小状態：うろつく

*/


// Explorer v2 — very conservative self-replicator with smart recharge and resource exploration
// Components: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
// Strategy: ultra-conservative thresholds, 135° wander steps for distant resource access

#define ENERGY_ENTER_RECHARGE  400
#define ENERGY_EXIT_RECHARGE   1000
#define ENERGY_ASSEMBLE        900
#define ENERGY_EXPLORE         1000
#define DURABILITY_REPAIR_ENTER 500
#define DURABILITY_REPAIR_EXIT  1100
#define ORE_NEEDED      24
#define CRYSTAL_NEEDED  26
#define METAL_NEEDED    12
#define CIRCUIT_NEEDED  13
#define COPY_SIZE       1900
#define CRAFT_STEPS     10
#define WANDER_STEP     135
#define RECHARGE_AMOUNT 400

int phase = 0;
int count = 0;
int craft_step = 0;
int wander_angle = 0;
int recharging = 0;
int child_id = 0;
int repairing = 0;
int move_target = 0;

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
                do_recharge();
                halt(); continue;
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
                do_recharge();
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
