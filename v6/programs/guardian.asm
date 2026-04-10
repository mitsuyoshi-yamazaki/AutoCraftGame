    JMP _main
_g_phase:
    .word 0
_g_count:
    .word 0
_g_craft_step:
    .word 0
_g_child_id:
    .word 0
_g_recharging:
    .word 0
_g_repairing:
    .word 0
_g_move_target:
    .word 0
_do_recharge_smart:
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
    LI r2, 24585
    IN r1, r2
    PUSH r1
    LI r1, 400
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L24
    ADD r1, r0, r0
    JMP _L25
_L24:
    LI r1, 1
_L25:
    BEQL r1, r0, _L22
    LW r1, r7, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L26
    ADD r1, r0, r0
    JMP _L27
_L26:
    LI r1, 1
_L27:
    BNEL r1, r0, _L23
_L22:
    ADD r1, r0, r0
_L23:
    BEQL r1, r0, _L20
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r1, 1
    LI r2, 24583
    OUT r2, r1
    LI r2, 24584
    IN r1, r2
    LI r3, _g_move_target
    SW r1, r3, 0
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
    JMP _L21
_L20:
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
_L21:
    JMP _L17
_L16:
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
_L12:
_do_recharge_smart_epilogue:
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_try_flee_crowd:
    PUSH r6
    LI r1, 7
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
    LI r1, 3
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
    ADDI r7, r7, 1
    POP r6
    JALR r0, r6
_L28:
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 24579
    OUT r2, r1
    LI r2, 24581
    IN r1, r2
    PUSH r1
    LI r1, 180
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    PUSH r1
    LW r1, r7, 0
    PUSH r1
    LI r1, 360
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L34
    ADD r1, r0, r0
    JMP _L35
_L34:
    LI r1, 1
_L35:
    BEQL r1, r0, _L32
    LW r1, r7, 0
    PUSH r1
    LI r1, 360
    MOV r2, r1
    POP r1
    SUB r1, r1, r2
    SW r1, r7, 0
_L32:
    LW r1, r7, 0
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
    LI r1, 1
    ADDI r7, r7, 2
    POP r6
    JALR r0, r6
_try_flee_crowd_epilogue:
    ADDI r7, r7, 2
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
    BLTL r1, r2, _L38
    ADD r1, r0, r0
    JMP _L39
_L38:
    LI r1, 1
_L39:
    BEQL r1, r0, _L36
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
    BLTL r1, r2, _L42
    ADD r1, r0, r0
    JMP _L43
_L42:
    LI r1, 1
_L43:
    BEQL r1, r0, _L40
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
    JMP _L41
_L40:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L41:
_L36:
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
    BLTL r1, r2, _L46
    ADD r1, r0, r0
    JMP _L47
_L46:
    LI r1, 1
_L47:
    BEQL r1, r0, _L44
    ADD r1, r0, r0
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
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L50
    ADD r1, r0, r0
    JMP _L51
_L50:
    LI r1, 1
_L51:
    BEQL r1, r0, _L48
    LI r1, 1
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
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L54
    ADD r1, r0, r0
    JMP _L55
_L54:
    LI r1, 1
_L55:
    BEQL r1, r0, _L52
    LI r1, 2
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L53
_L52:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L58
    ADD r1, r0, r0
    JMP _L59
_L58:
    LI r1, 1
_L59:
    BEQL r1, r0, _L56
    LI r1, 3
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L57
_L56:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L62
    ADD r1, r0, r0
    JMP _L63
_L62:
    LI r1, 1
_L63:
    BEQL r1, r0, _L60
    LI r1, 4
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L61
_L60:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L66
    ADD r1, r0, r0
    JMP _L67
_L66:
    LI r1, 1
_L67:
    BEQL r1, r0, _L64
    LI r1, 5
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L65
_L64:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 7
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L70
    ADD r1, r0, r0
    JMP _L71
_L70:
    LI r1, 1
_L71:
    BEQL r1, r0, _L68
    LI r1, 6
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L69
_L68:
    LI r1, 8
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
_L69:
_L65:
_L61:
_L57:
_L53:
_L49:
_L45:
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
_main:
    PUSH r6
_L72:
    LI r1, 1
    BEQL r1, r0, _L73
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
    BEQL r1, r2, _L76
    ADD r1, r0, r0
    JMP _L77
_L76:
    LI r1, 1
_L77:
    BEQL r1, r0, _L74
    LW r1, r7, 1
    PUSH r1
    LI r1, 1000
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L80
    ADD r1, r0, r0
    JMP _L81
_L80:
    LI r1, 1
_L81:
    BEQL r1, r0, _L78
    LI r1, 1
    LI r3, _g_recharging
    SW r1, r3, 0
_L78:
_L74:
    LI r3, _g_recharging
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L84
    ADD r1, r0, r0
    JMP _L85
_L84:
    LI r1, 1
_L85:
    BEQL r1, r0, _L82
    LW r1, r7, 1
    PUSH r1
    LI r1, 1100
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L88
    ADD r1, r0, r0
    JMP _L89
_L88:
    LI r1, 1
_L89:
    BEQL r1, r0, _L86
    ADD r1, r0, r0
    LI r3, _g_recharging
    SW r1, r3, 0
    JMP _L87
_L86:
    LI r5, _do_recharge_smart
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L87:
_L82:
    LI r5, _try_flee_crowd
    JALR r6, r5
    BEQL r1, r0, _L90
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L90:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L94
    ADD r1, r0, r0
    JMP _L95
_L94:
    LI r1, 1
_L95:
    BEQL r1, r0, _L92
    LW r1, r7, 0
    PUSH r1
    LI r1, 500
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L98
    ADD r1, r0, r0
    JMP _L99
_L98:
    LI r1, 1
_L99:
    BEQL r1, r0, _L96
    LI r1, 1
    LI r3, _g_repairing
    SW r1, r3, 0
_L96:
_L92:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L102
    ADD r1, r0, r0
    JMP _L103
_L102:
    LI r1, 1
_L103:
    BEQL r1, r0, _L100
    LW r1, r7, 0
    PUSH r1
    LI r1, 1100
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L106
    ADD r1, r0, r0
    JMP _L107
_L106:
    LI r1, 1
_L107:
    BEQL r1, r0, _L104
    ADD r1, r0, r0
    LI r3, _g_repairing
    SW r1, r3, 0
    JMP _L105
_L104:
    LI r1, 4
    LI r2, 16385
    OUT r2, r1
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L105:
_L100:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L110
    ADD r1, r0, r0
    JMP _L111
_L110:
    LI r1, 1
_L111:
    BEQL r1, r0, _L108
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 24
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L114
    ADD r1, r0, r0
    JMP _L115
_L114:
    LI r1, 1
_L115:
    BEQL r1, r0, _L112
    LI r1, 1
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L112:
    LI r1, 1
    PUSH r1
    POP r1
    LI r5, _do_harvest
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L108:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L118
    ADD r1, r0, r0
    JMP _L119
_L118:
    LI r1, 1
_L119:
    BEQL r1, r0, _L116
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 26
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L122
    ADD r1, r0, r0
    JMP _L123
_L122:
    LI r1, 1
_L123:
    BEQL r1, r0, _L120
    LI r1, 2
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L120:
    LI r1, 2
    PUSH r1
    POP r1
    LI r5, _do_harvest
    JALR r6, r5
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L116:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L126
    ADD r1, r0, r0
    JMP _L127
_L126:
    LI r1, 1
_L127:
    BEQL r1, r0, _L124
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 12
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L130
    ADD r1, r0, r0
    JMP _L131
_L130:
    LI r1, 1
_L131:
    BEQL r1, r0, _L128
    LI r1, 3
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    JMP _L129
_L128:
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
_L129:
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L124:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L134
    ADD r1, r0, r0
    JMP _L135
_L134:
    LI r1, 1
_L135:
    BEQL r1, r0, _L132
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 13
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L138
    ADD r1, r0, r0
    JMP _L139
_L138:
    LI r1, 1
_L139:
    BEQL r1, r0, _L136
    LI r1, 4
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_craft_step
    SW r1, r3, 0
    JMP _L137
_L136:
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
_L137:
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L132:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L142
    ADD r1, r0, r0
    JMP _L143
_L142:
    LI r1, 1
_L143:
    BEQL r1, r0, _L140
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 10
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L146
    ADD r1, r0, r0
    JMP _L147
_L146:
    LI r1, 1
_L147:
    BEQL r1, r0, _L144
    LI r1, 5
    LI r3, _g_phase
    SW r1, r3, 0
    JMP _L145
_L144:
    LI r5, _do_craft
    JALR r6, r5
_L145:
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L140:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L150
    ADD r1, r0, r0
    JMP _L151
_L150:
    LI r1, 1
_L151:
    BEQL r1, r0, _L148
    LW r1, r7, 1
    PUSH r1
    LI r1, 900
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L154
    ADD r1, r0, r0
    JMP _L155
_L154:
    LI r1, 1
_L155:
    BEQL r1, r0, _L152
    LI r5, _do_recharge_smart
    JALR r6, r5
    JMP _L153
_L152:
    LI r1, 6
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_craft_step
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_recharging
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_repairing
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_child_id
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_move_target
    SW r1, r3, 0
    LI r1, 2
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
    LI r1, 1900
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
_L153:
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L148:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L158
    ADD r1, r0, r0
    JMP _L159
_L158:
    LI r1, 1
_L159:
    BEQL r1, r0, _L156
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
    LI r3, _g_child_id
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L156:
    HALT
    ADDI r7, r7, 2
    JMP _L72
_L73:
_main_epilogue:
    POP r6
    JALR r0, r6
