# Changes in this release

- Changed: a `keepMounted` Command asks for the empty search's results (`onQueryChange("")`) once its closing fade has ended, not as it starts to close, so the palette fades out showing what the person searched; an app or test that expects that call right as the palette closes should wait for the fade.
