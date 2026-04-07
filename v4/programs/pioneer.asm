    JMP _main
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
_g_child_id:
    .word 0
_g_repairing:
    .word 0
_main:
    PUSH r6
_L0:
    LI r1, 1
    BEQL r1, r0, _L1
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
    BEQL r1, r2, _L4
    ADD r1, r0, r0
    JMP _L5
_L4:
    LI r1, 1
_L5:
    BEQL r1, r0, _L2
    LW r1, r7, 1
    PUSH r1
    LI r1, 250
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L8
    ADD r1, r0, r0
    JMP _L9
_L8:
    LI r1, 1
_L9:
    BEQL r1, r0, _L6
    LI r1, 1
    LI r3, _g_recharging
    SW r1, r3, 0
_L6:
_L2:
    LI r3, _g_recharging
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L12
    ADD r1, r0, r0
    JMP _L13
_L12:
    LI r1, 1
_L13:
    BEQL r1, r0, _L10
    LW r1, r7, 1
    PUSH r1
    LI r1, 700
    MOV r2, r1
    POP r1
    MOV r3, r1
    MOV r1, r2
    MOV r2, r3
    BLTL r1, r2, _L16
    ADD r1, r0, r0
    JMP _L17
_L16:
    LI r1, 1
_L17:
    BEQL r1, r0, _L14
    ADD r1, r0, r0
    LI r3, _g_recharging
    SW r1, r3, 0
    JMP _L15
_L14:
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
    LI r2, 24582
    IN r1, r2
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
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    JMP _L23
_L22:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L23:
    JMP _L19
_L18:
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    LI r1, 90
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
_L19:
    HALT
    ADDI r7, r7, 3
    JMP _L0
    ADDI r7, r7, 1
_L15:
_L10:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L28
    ADD r1, r0, r0
    JMP _L29
_L28:
    LI r1, 1
_L29:
    BEQL r1, r0, _L26
    LW r1, r7, 0
    PUSH r1
    LI r1, 2000
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L32
    ADD r1, r0, r0
    JMP _L33
_L32:
    LI r1, 1
_L33:
    BEQL r1, r0, _L30
    LI r1, 1
    LI r3, _g_repairing
    SW r1, r3, 0
_L30:
_L26:
    LI r3, _g_repairing
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L36
    ADD r1, r0, r0
    JMP _L37
_L36:
    LI r1, 1
_L37:
    BEQL r1, r0, _L34
    LW r1, r7, 0
    PUSH r1
    LI r1, 4000
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
    ADD r1, r0, r0
    LI r3, _g_repairing
    SW r1, r3, 0
    JMP _L39
_L38:
    LI r1, 4
    LI r2, 16385
    OUT r2, r1
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L39:
_L34:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    ADD r1, r0, r0
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L44
    ADD r1, r0, r0
    JMP _L45
_L44:
    LI r1, 1
_L45:
    BEQL r1, r0, _L42
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 24
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L48
    ADD r1, r0, r0
    JMP _L49
_L48:
    LI r1, 1
_L49:
    BEQL r1, r0, _L46
    LI r1, 1
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L46:
    LI r1, 1
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
    BLTL r1, r2, _L52
    ADD r1, r0, r0
    JMP _L53
_L52:
    LI r1, 1
_L53:
    BEQL r1, r0, _L50
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
    BLTL r1, r2, _L56
    ADD r1, r0, r0
    JMP _L57
_L56:
    LI r1, 1
_L57:
    BEQL r1, r0, _L54
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
    JMP _L55
_L54:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L55:
    JMP _L51
_L50:
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    LI r1, 90
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
_L51:
    HALT
    ADDI r7, r7, 3
    JMP _L0
    ADDI r7, r7, 1
_L42:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L60
    ADD r1, r0, r0
    JMP _L61
_L60:
    LI r1, 1
_L61:
    BEQL r1, r0, _L58
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 26
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L64
    ADD r1, r0, r0
    JMP _L65
_L64:
    LI r1, 1
_L65:
    BEQL r1, r0, _L62
    LI r1, 2
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L62:
    LI r1, 2
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
    BLTL r1, r2, _L68
    ADD r1, r0, r0
    JMP _L69
_L68:
    LI r1, 1
_L69:
    BEQL r1, r0, _L66
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
    BLTL r1, r2, _L72
    ADD r1, r0, r0
    JMP _L73
_L72:
    LI r1, 1
_L73:
    BEQL r1, r0, _L70
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
    JMP _L71
_L70:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L71:
    JMP _L67
_L66:
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    LI r1, 90
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
_L67:
    HALT
    ADDI r7, r7, 3
    JMP _L0
    ADDI r7, r7, 1
_L58:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L76
    ADD r1, r0, r0
    JMP _L77
_L76:
    LI r1, 1
_L77:
    BEQL r1, r0, _L74
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 12
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L80
    ADD r1, r0, r0
    JMP _L81
_L80:
    LI r1, 1
_L81:
    BEQL r1, r0, _L78
    LI r1, 3
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_count
    SW r1, r3, 0
    JMP _L79
_L78:
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
_L79:
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L74:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L84
    ADD r1, r0, r0
    JMP _L85
_L84:
    LI r1, 1
_L85:
    BEQL r1, r0, _L82
    LI r3, _g_count
    LW r1, r3, 0
    PUSH r1
    LI r1, 13
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L88
    ADD r1, r0, r0
    JMP _L89
_L88:
    LI r1, 1
_L89:
    BEQL r1, r0, _L86
    LI r1, 4
    LI r3, _g_phase
    SW r1, r3, 0
    ADD r1, r0, r0
    LI r3, _g_craft_step
    SW r1, r3, 0
    JMP _L87
_L86:
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
_L87:
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L82:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L92
    ADD r1, r0, r0
    JMP _L93
_L92:
    LI r1, 1
_L93:
    BEQL r1, r0, _L90
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 10
    MOV r2, r1
    POP r1
    BGEL r1, r2, _L96
    ADD r1, r0, r0
    JMP _L97
_L96:
    LI r1, 1
_L97:
    BEQL r1, r0, _L94
    LI r1, 5
    LI r3, _g_phase
    SW r1, r3, 0
    JMP _L95
_L94:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L100
    ADD r1, r0, r0
    JMP _L101
_L100:
    LI r1, 1
_L101:
    BEQL r1, r0, _L98
    ADD r1, r0, r0
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L99
_L98:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 2
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L104
    ADD r1, r0, r0
    JMP _L105
_L104:
    LI r1, 1
_L105:
    BEQL r1, r0, _L102
    LI r1, 1
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L103
_L102:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 3
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L108
    ADD r1, r0, r0
    JMP _L109
_L108:
    LI r1, 1
_L109:
    BEQL r1, r0, _L106
    LI r1, 2
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L107
_L106:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 4
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L112
    ADD r1, r0, r0
    JMP _L113
_L112:
    LI r1, 1
_L113:
    BEQL r1, r0, _L110
    LI r1, 3
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L111
_L110:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L116
    ADD r1, r0, r0
    JMP _L117
_L116:
    LI r1, 1
_L117:
    BEQL r1, r0, _L114
    LI r1, 4
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L115
_L114:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L120
    ADD r1, r0, r0
    JMP _L121
_L120:
    LI r1, 1
_L121:
    BEQL r1, r0, _L118
    LI r1, 5
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L119
_L118:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 7
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L124
    ADD r1, r0, r0
    JMP _L125
_L124:
    LI r1, 1
_L125:
    BEQL r1, r0, _L122
    LI r1, 6
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
    JMP _L123
_L122:
    LI r1, 8
    PUSH r1
    POP r1
    LI r2, 16386
    OUT r2, r1
    LI r1, 2
    LI r2, 16385
    OUT r2, r1
_L123:
_L119:
_L115:
_L111:
_L107:
_L103:
_L99:
    LI r3, _g_craft_step
    LW r1, r3, 0
    PUSH r1
    LI r1, 1
    MOV r2, r1
    POP r1
    ADD r1, r1, r2
    LI r3, _g_craft_step
    SW r1, r3, 0
_L95:
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L90:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 5
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L128
    ADD r1, r0, r0
    JMP _L129
_L128:
    LI r1, 1
_L129:
    BEQL r1, r0, _L126
    LW r1, r7, 1
    PUSH r1
    LI r1, 700
    MOV r2, r1
    POP r1
    BLTL r1, r2, _L132
    ADD r1, r0, r0
    JMP _L133
_L132:
    LI r1, 1
_L133:
    BEQL r1, r0, _L130
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
    BLTL r1, r2, _L136
    ADD r1, r0, r0
    JMP _L137
_L136:
    LI r1, 1
_L137:
    BEQL r1, r0, _L134
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
    BLTL r1, r2, _L140
    ADD r1, r0, r0
    JMP _L141
_L140:
    LI r1, 1
_L141:
    BEQL r1, r0, _L138
    LI r1, 1
    LI r2, 12289
    OUT r2, r1
    JMP _L139
_L138:
    LI r2, 24581
    IN r1, r2
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
_L139:
    JMP _L135
_L134:
    LI r3, _g_wander_angle
    LW r1, r3, 0
    PUSH r1
    LI r1, 90
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
_L135:
    ADDI r7, r7, 1
    JMP _L131
_L130:
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
    LI r1, 1400
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
_L131:
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L126:
    LI r3, _g_phase
    LW r1, r3, 0
    PUSH r1
    LI r1, 6
    MOV r2, r1
    POP r1
    BEQL r1, r2, _L144
    ADD r1, r0, r0
    JMP _L145
_L144:
    LI r1, 1
_L145:
    BEQL r1, r0, _L142
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
    JMP _L0
_L142:
    HALT
    ADDI r7, r7, 2
    JMP _L0
_L1:
_main_epilogue:
    POP r6
    JALR r0, r6
