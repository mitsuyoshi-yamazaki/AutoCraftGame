    JMP _main
_g_state:
    .word 0
_g_target_angle:
    .word 0
_g_move_counter:
    .word 0
_g_harvest_count:
    .word 0
_main:
    PUSH r6
_L0:
    LI r1, 1
    BEQL r1, r0, _L1
    LI r2, 0
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    LI r1, 200
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L4
    ADD r1, r0, r0
    JMP _L5
_L4:
    LI r1, 1
_L5:
    BEQL r1, r0, _L2
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
    BLTL r1, r2, _L8
    ADD r1, r0, r0
    JMP _L9
_L8:
    LI r1, 1
_L9:
    BEQL r1, r0, _L6
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L12
    ADD r1, r0, r0
    JMP _L13
_L12:
    LI r1, 1
_L13:
    BEQL r1, r0, _L10
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    JMP _L11
_L10:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L11:
    JMP _L7
_L6:
    LW r1, r7, 2
    PUSH r1
    LI r1, 360
    MOV r2, r1
    POP r1
    MOD r1, r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L7:
    HALT
    JMP _L0
_L2:
    LI r3, _g_state
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L16
    ADD r1, r0, r0
    JMP _L17
_L16:
    LI r1, 1
_L17:
    BEQL r1, r0, _L14
    LI r1, 4
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
    BLTL r1, r2, _L20
    ADD r1, r0, r0
    JMP _L21
_L20:
    LI r1, 1
_L21:
    BEQL r1, r0, _L18
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24581
    IN r1, r2
    LI r3, _g_target_angle
    SW r1, r3, 0
    LI r2, 24582
    IN r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L24
    ADD r1, r0, r0
    JMP _L25
_L24:
    LI r1, 1
_L25:
    BEQL r1, r0, _L22
    LI r1, 2
    LI r3, _g_state
    SW r1, r3, 0
    JMP _L23
_L22:
    LI r1, 1
    LI r3, _g_state
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_move_counter
    SW r1, r3, 0
_L23:
    JMP _L19
_L18:
    LW r1, r7, 4
    PUSH r1
    LI r1, 360
    MOV r2, r1
    POP r1
    MOD r1, r1, r2
    LI r3, _g_target_angle
    SW r1, r3, 0
    LI r1, 1
    LI r3, _g_state
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_move_counter
    SW r1, r3, 0
_L19:
    JMP _L15
_L14:
    LI r3, _g_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L28
    ADD r1, r0, r0
    JMP _L29
_L28:
    LI r1, 1
_L29:
    BEQL r1, r0, _L26
    LI r3, _g_target_angle
    LW r1, r3, 0
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
    LI r3, _g_move_counter
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_move_counter
    SW r1, r3, 0
    LI r3, _g_move_counter
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L32
    ADD r1, r0, r0
    JMP _L33
_L32:
    LI r1, 1
_L33:
    BEQL r1, r0, _L30
    ADD r1, r0, r0
    LI r3, _g_state
    SW r1, r3, 0
_L30:
    JMP _L27
_L26:
    LI r3, _g_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L36
    ADD r1, r0, r0
    JMP _L37
_L36:
    LI r1, 1
_L37:
    BEQL r1, r0, _L34
    LI r1, 1
    LI r2, 8193
    OUT r2, r1
    LI r3, _g_harvest_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_harvest_count
    SW r1, r3, 0
    LI r3, _g_harvest_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 20
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L40
    ADD r1, r0, r0
    JMP _L41
_L40:
    LI r1, 1
_L41:
    BEQL r1, r0, _L38
    LI r1, 3
    LI r3, _g_state
    SW r1, r3, 0
    JMP _L39
_L38:
    ADD r1, r0, r0
    LI r3, _g_state
    SW r1, r3, 0
_L39:
    JMP _L35
_L34:
    LI r3, _g_state
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L44
    ADD r1, r0, r0
    JMP _L45
_L44:
    LI r1, 1
_L45:
    BEQL r1, r0, _L42
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 1
    LI r2, 16385
    OUT r2, r1
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 1
    LI r2, 16385
    OUT r2, r1
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 2
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 3
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 4
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 5
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 6
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 8
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    LI r1, 1
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
    LI r1, 3
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
    PUSH r1
    LI r1, 512
    PUSH r1
    ADD r1, r0, r0
    PUSH r1
    ADD r1, r0, r0
    PUSH r1
    LW r1, r7, 3
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
    LW r1, r7, 0
    PUSH r1
    POP r1
    LI r2, 20482
    OUT r2, r1
    LI r1, 2
    LI r2, 20481
    OUT r2, r1
    ADD r1, r0, r0
    LI r3, _g_harvest_count
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_state
    SW r1, r3, 0
    JMP _L43
_L42:
    ADD r1, r0, r0
    LI r3, _g_state
    SW r1, r3, 0
_L43:
_L35:
_L27:
_L15:
    HALT
    JMP _L0
_L1:
_main_epilogue:
    ADDI r7, r7, 6
    POP r6
    JALR r0, r6
