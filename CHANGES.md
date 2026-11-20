# Changes in this release

- Changed: the keyboard-only focus rings switch to keyboard mode only on a key that moves focus (Tab and Shift+Tab, the arrows, Home, End, Page Up, Page Down), as Fluent's keyborg does, so Escape, Enter, a shortcut or a typed character no longer brings a clicked control's ring back; `lastInput()` still reports "keyboard" after any key.
