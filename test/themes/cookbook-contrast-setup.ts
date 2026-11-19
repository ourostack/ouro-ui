import { applyThemeFixture } from "../theme-fixtures.ts";

// The `themes-contrast` project's setup: every component test file it runs sees Spoonjoy's cookbook theme in place of
// the Ouro look, whose dark text and muted text are brighter than Ouro's. A shipped contrast test that holds only in
// Ouro's palette fails here, before an app that vendors it does.
applyThemeFixture("cookbook");
