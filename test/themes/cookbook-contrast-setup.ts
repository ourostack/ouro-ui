import { applyThemeFixture } from "../theme-fixtures.ts";

// The `themes-contrast` project's setup: every component test file it runs sees Spoonjoy's cookbook theme in place of
// the Ouro look, whose dark text and muted text are brighter than Ouro's, and whose disabled solid button keeps full
// opacity in its own colours. A shipped contrast or looks-off test that holds only in Ouro's palette or Ouro's dimming
// fails here, before an app that vendors it does (spoonjoy-v2#815).
applyThemeFixture("cookbook");
