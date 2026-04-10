    JMP _main
_main:
    PUSH r6
    HALT
_main_epilogue:
    POP r6
    JALR r0, r6
