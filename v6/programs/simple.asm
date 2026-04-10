    JMP _main
_main:
    PUSH r6
_L0:
    LI r1, 1
    BEQL r1, r0, _L1
    LI r1, 90
    PUSH r1
    POP r1
    LI r2, 4098
    OUT r2, r1
    LI r1, 1
    LI r2, 4097
    OUT r2, r1
    HALT
    JMP _L0
_L1:
_main_epilogue:
    POP r6
    JALR r0, r6
