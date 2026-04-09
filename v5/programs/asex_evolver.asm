    JMP _main
_g_wander_step:
    .word 90
_g_recharge_low:
    .word 350
_g_recharge_high:
    .word 1100
_g_ore_target:
    .word 24
_g_crystal_target:
    .word 34
_g_behavior_mode:
    .word 0
_g_phase:
    .word 0
_g_count:
    .word 0
_g_craft_step:
    .word 0
_g_wander_angle:
    .word 0
_g_recharging:
    .word 0
_g_repairing:
    .word 0
_g_child_id:
    .word 0
_g_rng_state:
    .word 31415
_g_move_target:
    .word 0
_next_rand:
    PUSH r6
    LI r3, _g_rng_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 20077
    MOV r2, r1
    POP r1
    MUL r1, r1, r2
    LI r3, _g_rng_state
    SW r1, r3, 0
    LI r3, _g_rng_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 12345
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_rng_state
    SW r1, r3, 0
    LI r3, _g_rng_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 32767
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    LI r3, _g_rng_state
    SW r1, r3, 0
    LI r3, _g_rng_state
    LW r1, r3, 0
    POP r6
    JALR r0, r6
_next_rand_epilogue:
    POP r6
    JALR r0, r6
_do_wander:
    PUSH r6
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_wander_step
    LW r1, r3, 0
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_wander_angle
    SW r1, r3, 0
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_do_wander_epilogue:
    POP r6
    JALR r0, r6
_do_recharge:
    PUSH r6
    LI r3, _g_move_target
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BNEL r1, r2, _L2
    ADD r1, r0, r0
    JMP _L3
_L2:
    LI r1, 1
_L3:
    BEQL r1, r0, _L0
    LI r3, _g_move_target
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 24578
    OUT r2, r1
    LI r1, 2
    LI r2, 24577
    OUT r2, r1
    LI r2, 24580
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L6
    ADD r1, r0, r0
    JMP _L7
_L6:
    LI r1, 1
_L7:
    BEQL r1, r0, _L4
    ADD r1, r0, r0
    LI r3, _g_move_target
    SW r1, r3, 0
    JMP _L5
_L4:
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L10
    ADD r1, r0, r0
    JMP _L11
_L10:
    LI r1, 1
_L11:
    BEQL r1, r0, _L8
    ADD r1, r0, r0
    LI r3, _g_move_target
    SW r1, r3, 0
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
    JMP _L9
_L8:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_L9:
_L5:
    ADDI r7, r7, 1
_L0:
    LI r1, 3
    PUSH r1
    POP r1
    LI r2, 24578
    OUT r2, r1
    LI r1, 1
    LI r2, 24577
    OUT r2, r1
    LI r2, 24578
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L14
    ADD r1, r0, r0
    JMP _L15
_L14:
    LI r1, 1
_L15:
    BEQL r1, r0, _L12
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L18
    ADD r1, r0, r0
    JMP _L19
_L18:
    LI r1, 1
_L19:
    BEQL r1, r0, _L16
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    JMP _L17
_L16:
    LI r1, 1
    LI r2, 24583
    OUT r2, r1
    LI r2, 24584
    IN r1, r2
    LI r3, _g_move_target
    SW r1, r3, 0
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L17:
    JMP _L13
_L12:
    LI r5, _do_wander
    JALR r6, r5
_L13:
_do_recharge_epilogue:
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_do_harvest:
    PUSH r6
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    POP r1
    LI r2, 24578
    OUT r2, r1
    LI r1, 1
    LI r2, 24577
    OUT r2, r1
    LI r2, 24578
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L22
    ADD r1, r0, r0
    JMP _L23
_L22:
    LI r1, 1
_L23:
    BEQL r1, r0, _L20
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L26
    ADD r1, r0, r0
    JMP _L27
_L26:
    LI r1, 1
_L27:
    BEQL r1, r0, _L24
    LI r1, 1
    LI r2, 8193
    OUT r2, r1
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_count
    SW r1, r3, 0
    JMP _L25
_L24:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L25:
    JMP _L21
_L20:
    LI r5, _do_wander
    JALR r6, r5
_L21:
_do_harvest_epilogue:
    ADDI r7, r7, 2
    POP r6
    JALR r0, r6
_do_craft:
    PUSH r6
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L30
    ADD r1, r0, r0
    JMP _L31
_L30:
    LI r1, 1
_L31:
    BEQL r1, r0, _L28
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L29
_L28:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L34
    ADD r1, r0, r0
    JMP _L35
_L34:
    LI r1, 1
_L35:
    BEQL r1, r0, _L32
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L33
_L32:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L38
    ADD r1, r0, r0
    JMP _L39
_L38:
    LI r1, 1
_L39:
    BEQL r1, r0, _L36
    LI r1, 2
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L37
_L36:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L42
    ADD r1, r0, r0
    JMP _L43
_L42:
    LI r1, 1
_L43:
    BEQL r1, r0, _L40
    LI r1, 3
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L41
_L40:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L46
    ADD r1, r0, r0
    JMP _L47
_L46:
    LI r1, 1
_L47:
    BEQL r1, r0, _L44
    LI r1, 4
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L45
_L44:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L50
    ADD r1, r0, r0
    JMP _L51
_L50:
    LI r1, 1
_L51:
    BEQL r1, r0, _L48
    LI r1, 5
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L49
_L48:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 7
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L54
    ADD r1, r0, r0
    JMP _L55
_L54:
    LI r1, 1
_L55:
    BEQL r1, r0, _L52
    LI r1, 6
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L53
_L52:
    LI r1, 8
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
_L53:
_L49:
_L45:
_L41:
_L37:
_L33:
_L29:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_craft_step
    SW r1, r3, 0
_do_craft_epilogue:
    POP r6
    JALR r0, r6
_mode_aggressive_recharge:
    PUSH r6
    LI r5, _do_recharge
    JALR r6, r5
_mode_aggressive_recharge_epilogue:
    POP r6
    JALR r0, r6
_mode_erratic_wander:
    PUSH r6
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LW r1, r7, 0
    LI r3, _g_wander_angle
    SW r1, r3, 0
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_mode_erratic_wander_epilogue:
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_mode_scavenge:
    PUSH r6
    LI r1, 6
    PUSH r1
    POP r1
    LI r2, 24578
    OUT r2, r1
    LI r1, 1
    LI r2, 24577
    OUT r2, r1
    LI r2, 24578
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L58
    ADD r1, r0, r0
    JMP _L59
_L58:
    LI r1, 1
_L59:
    BEQL r1, r0, _L56
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L62
    ADD r1, r0, r0
    JMP _L63
_L62:
    LI r1, 1
_L63:
    BEQL r1, r0, _L60
    LI r1, 1
    LI r2, 24583
    OUT r2, r1
    LI r2, 24584
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    POP r1
    LI r2, 28674
    OUT r2, r1
    LI r1, 1
    LI r2, 28673
    OUT r2, r1
    ADDI r7, r7, 1
    JMP _L61
_L60:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L61:
    JMP _L57
_L56:
    LI r5, _do_wander
    JALR r6, r5
_L57:
_mode_scavenge_epilogue:
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_do_replicate:
    PUSH r6
    LI r3, _g_wander_step
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_recharge_low
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_recharge_high
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_ore_target
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_crystal_target
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_behavior_mode
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_rng_state
    LW r1, r3, 0
    PUSH r1
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    LI r1, 31
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L66
    ADD r1, r0, r0
    JMP _L67
_L66:
    LI r1, 1
_L67:
    BEQL r1, r0, _L64
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    LI r3, _g_behavior_mode
    SW r1, r3, 0
_L64:
    LI r3, _g_wander_step
    LW r1, r3, 0
    PUSH r1
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LI r1, 31
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    PUSH r1
    LI r1, 15
    MOV r2, r1
    POP r1
    SUB r1, r1, r2
    LI r3, _g_wander_step
    SW r1, r3, 0
    LI r3, _g_wander_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 30
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L70
    ADD r1, r0, r0
    JMP _L71
_L70:
    LI r1, 1
_L71:
    BEQL r1, r0, _L68
    LI r1, 30
    LI r3, _g_wander_step
    SW r1, r3, 0
_L68:
    LI r3, _g_wander_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 180
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L74
    ADD r1, r0, r0
    JMP _L75
_L74:
    LI r1, 1
_L75:
    BEQL r1, r0, _L72
    LI r1, 180
    LI r3, _g_wander_step
    SW r1, r3, 0
_L72:
    LI r3, _g_ore_target
    LW r1, r3, 0
    PUSH r1
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    SUB r1, r1, r2
    LI r3, _g_ore_target
    SW r1, r3, 0
    LI r3, _g_ore_target
    LW r1, r3, 0
    PUSH r1
    LI r1, 20
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L78
    ADD r1, r0, r0
    JMP _L79
_L78:
    LI r1, 1
_L79:
    BEQL r1, r0, _L76
    LI r1, 20
    LI r3, _g_ore_target
    SW r1, r3, 0
_L76:
    LI r3, _g_ore_target
    LW r1, r3, 0
    PUSH r1
    LI r1, 32
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L82
    ADD r1, r0, r0
    JMP _L83
_L82:
    LI r1, 1
_L83:
    BEQL r1, r0, _L80
    LI r1, 32
    LI r3, _g_ore_target
    SW r1, r3, 0
_L80:
    LI r3, _g_crystal_target
    LW r1, r3, 0
    PUSH r1
    LI r5, _next_rand
    JALR r6, r5
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    AND r1, r1, r2
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    SUB r1, r1, r2
    LI r3, _g_crystal_target
    SW r1, r3, 0
    LI r3, _g_crystal_target
    LW r1, r3, 0
    PUSH r1
    LI r1, 28
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L86
    ADD r1, r0, r0
    JMP _L87
_L86:
    LI r1, 1
_L87:
    BEQL r1, r0, _L84
    LI r1, 28
    LI r3, _g_crystal_target
    SW r1, r3, 0
_L84:
    LI r3, _g_crystal_target
    LW r1, r3, 0
    PUSH r1
    LI r1, 40
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L90
    ADD r1, r0, r0
    JMP _L91
_L90:
    LI r1, 1
_L91:
    BEQL r1, r0, _L88
    LI r1, 40
    LI r3, _g_crystal_target
    SW r1, r3, 0
_L88:
    LI r5, _next_rand
    JALR r6, r5
    LI r3, _g_rng_state
    SW r1, r3, 0
    LI r1, 4
    PUSH r1
    ADD r1, r0, r0
    PUSH r1
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16392
    OUT r2, r1
    POP r1
    LI r2, 16393
    OUT r2, r1
    POP r1
    LI r2, 16394
    OUT r2, r1
    LI r1, 1
    PUSH r1
    LI r1, 1
    PUSH r1
    LI r1, 1
    PUSH r1
    LI r1, 1
    PUSH r1
    LI r1, 1
    PUSH r1
    LI r1, 2
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    POP r1
    LI r2, 16387
    OUT r2, r1
    POP r1
    LI r2, 16388
    OUT r2, r1
    POP r1
    LI r2, 16389
    OUT r2, r1
    POP r1
    LI r2, 16390
    OUT r2, r1
    POP r1
    LI r2, 16391
    OUT r2, r1
    LI r1, 3
    LI r2, 16385
    OUT r2, r1
    LI r2, 16386
    IN r1, r2
    LI r3, _g_child_id
    SW r1, r3, 0
    LI r1, 2700
    PUSH r1
    ADD r1, r0, r0
    PUSH r1
    ADD r1, r0, r0
    PUSH r1
    LI r3, _g_child_id
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 20482
    OUT r2, r1
    POP r1
    LI r2, 20483
    OUT r2, r1
    POP r1
    LI r2, 20484
    OUT r2, r1
    POP r1
    LI r2, 20485
    OUT r2, r1
    LI r1, 1
    LI r2, 20481
    OUT r2, r1
    LW r1, r7, 7
    LI r3, _g_wander_step
    SW r1, r3, 0
    LW r1, r7, 6
    LI r3, _g_recharge_low
    SW r1, r3, 0
    LW r1, r7, 5
    LI r3, _g_recharge_high
    SW r1, r3, 0
    LW r1, r7, 4
    LI r3, _g_ore_target
    SW r1, r3, 0
    LW r1, r7, 3
    LI r3, _g_crystal_target
    SW r1, r3, 0
    LW r1, r7, 2
    LI r3, _g_behavior_mode
    SW r1, r3, 0
    LW r1, r7, 1
    LI r3, _g_rng_state
    SW r1, r3, 0
_do_replicate_epilogue:
    LI r3, 8
    ADD r7, r7, r3
    POP r6
    JALR r0, r6
_main:
    PUSH r6
_L92:
    LI r1, 1
    BEQL r1, r0, _L93
    CHECKPOINT
    LI r2, 0
    IN r1, r2
    PUSH r1
    LI r2, 1
    IN r1, r2
    PUSH r1
    LI r3, _g_recharging
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L96
    ADD r1, r0, r0
    JMP _L97
_L96:
    LI r1, 1
_L97:
    BEQL r1, r0, _L94
    LW r1, r7, 1
    PUSH r1
    LI r3, _g_recharge_low
    LW r1, r3, 0
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L100
    ADD r1, r0, r0
    JMP _L101
_L100:
    LI r1, 1
_L101:
    BEQL r1, r0, _L98
    LI r1, 1
    LI r3, _g_recharging
    SW r1, r3, 0
_L98:
_L94:
    LI r3, _g_recharging
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L104
    ADD r1, r0, r0
    JMP _L105
_L104:
    LI r1, 1
_L105:
    BEQL r1, r0, _L102
    LW r1, r7, 1
    PUSH r1
    LI r3, _g_recharge_high
    LW r1, r3, 0
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L108
    ADD r1, r0, r0
    JMP _L109
_L108:
    LI r1, 1
_L109:
    BEQL r1, r0, _L106
    ADD r1, r0, r0
    LI r3, _g_recharging
    SW r1, r3, 0
    JMP _L107
_L106:
    LI r5, _do_recharge
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L107:
_L102:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L112
    ADD r1, r0, r0
    JMP _L113
_L112:
    LI r1, 1
_L113:
    BEQL r1, r0, _L110
    LW r1, r7, 0
    PUSH r1
    LI r1, 400
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L116
    ADD r1, r0, r0
    JMP _L117
_L116:
    LI r1, 1
_L117:
    BEQL r1, r0, _L114
    LI r1, 1
    LI r3, _g_repairing
    SW r1, r3, 0
_L114:
_L110:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L120
    ADD r1, r0, r0
    JMP _L121
_L120:
    LI r1, 1
_L121:
    BEQL r1, r0, _L118
    LW r1, r7, 0
    PUSH r1
    LI r1, 800
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L124
    ADD r1, r0, r0
    JMP _L125
_L124:
    LI r1, 1
_L125:
    BEQL r1, r0, _L122
    ADD r1, r0, r0
    LI r3, _g_repairing
    SW r1, r3, 0
    JMP _L123
_L122:
    LI r1, 4
    LI r2, 16385
    OUT r2, r1
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L123:
_L118:
    LI r3, _g_behavior_mode
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L128
    ADD r1, r0, r0
    JMP _L129
_L128:
    LI r1, 1
_L129:
    BEQL r1, r0, _L126
    LI r5, _mode_aggressive_recharge
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L126:
    LI r3, _g_behavior_mode
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L132
    ADD r1, r0, r0
    JMP _L133
_L132:
    LI r1, 1
_L133:
    BEQL r1, r0, _L130
    LI r5, _mode_erratic_wander
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L130:
    LI r3, _g_behavior_mode
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L136
    ADD r1, r0, r0
    JMP _L137
_L136:
    LI r1, 1
_L137:
    BEQL r1, r0, _L134
    LI r5, _mode_scavenge
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L134:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L140
    ADD r1, r0, r0
    JMP _L141
_L140:
    LI r1, 1
_L141:
    BEQL r1, r0, _L138
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_ore_target
    LW r1, r3, 0
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L144
    ADD r1, r0, r0
    JMP _L145
_L144:
    LI r1, 1
_L145:
    BEQL r1, r0, _L142
    LI r1, 1
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L142:
    LI r1, 1
    PUSH r1
    POP r1
    LI r5, _do_harvest
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L138:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L148
    ADD r1, r0, r0
    JMP _L149
_L148:
    LI r1, 1
_L149:
    BEQL r1, r0, _L146
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r3, _g_crystal_target
    LW r1, r3, 0
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L152
    ADD r1, r0, r0
    JMP _L153
_L152:
    LI r1, 1
_L153:
    BEQL r1, r0, _L150
    LI r1, 2
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L150:
    LI r1, 2
    PUSH r1
    POP r1
    LI r5, _do_harvest
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L146:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L156
    ADD r1, r0, r0
    JMP _L157
_L156:
    LI r1, 1
_L157:
    BEQL r1, r0, _L154
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 12
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L160
    ADD r1, r0, r0
    JMP _L161
_L160:
    LI r1, 1
_L161:
    BEQL r1, r0, _L158
    LI r1, 3
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L158:
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 1
    LI r2, 16385
    OUT r2, r1
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L154:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L164
    ADD r1, r0, r0
    JMP _L165
_L164:
    LI r1, 1
_L165:
    BEQL r1, r0, _L162
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 17
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L168
    ADD r1, r0, r0
    JMP _L169
_L168:
    LI r1, 1
_L169:
    BEQL r1, r0, _L166
    LI r1, 4
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_craft_step
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L166:
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 1
    LI r2, 16385
    OUT r2, r1
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L162:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L172
    ADD r1, r0, r0
    JMP _L173
_L172:
    LI r1, 1
_L173:
    BEQL r1, r0, _L170
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 12
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L176
    ADD r1, r0, r0
    JMP _L177
_L176:
    LI r1, 1
_L177:
    BEQL r1, r0, _L174
    LI r1, 5
    LI r3, _g_phase
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L174:
    LI r5, _do_craft
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L170:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L180
    ADD r1, r0, r0
    JMP _L181
_L180:
    LI r1, 1
_L181:
    BEQL r1, r0, _L178
    LW r1, r7, 1
    PUSH r1
    LI r1, 1100
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L184
    ADD r1, r0, r0
    JMP _L185
_L184:
    LI r1, 1
_L185:
    BEQL r1, r0, _L182
    LI r5, _do_recharge
    JALR r6, r5
    JMP _L183
_L182:
    LI r5, _do_replicate
    JALR r6, r5
    LI r1, 6
    LI r3, _g_phase
    SW r1, r3, 0
_L183:
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L178:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L188
    ADD r1, r0, r0
    JMP _L189
_L188:
    LI r1, 1
_L189:
    BEQL r1, r0, _L186
    LI r3, _g_child_id
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 20482
    OUT r2, r1
    LI r1, 2
    LI r2, 20481
    OUT r2, r1
    ADD r1, r0, r0
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_craft_step
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_child_id
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_move_target
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L186:
    HALT
    ADDI r7, r7, 2
    JMP _L92
_L93:
_main_epilogue:
    POP r6
    JALR r0, r6
