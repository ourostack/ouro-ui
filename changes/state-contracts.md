- EditSheet restores cleared field errors and replaces its alert for every accepted save refusal, including equal messages and reused results. Pending work and results from a closed or unmounted opening do not mark a new edit.

- DatePicker restores its uncontrolled default and ISO submission value on native form reset, preserves controlled ownership and prevented resets, and keeps invalid defaults invalid. Its hidden readonly ISO backing control has native defaults independent of the displayed draft.

- Combobox keeps uncontrolled custom values and clears across responsive popup/sheet changes. Native reset restores its custom default without taking ownership from a controlled caller.
