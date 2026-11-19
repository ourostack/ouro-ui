# Changes in this release

- Fixed: the first-run gate [counts a page still drawing under the app's own view, which says it's signing in, as in progress](scripts/check/first-run-units.test.mts "verify:testExists(scripts/check/first-run-units.test.mts::first-run harness: the judges > a blank page under the app's own view that says it's signing in is in progress; once that view is gone, or the window is one shade, it's blank and a dead end)"), not as blank or a dead end; once that view is gone, a page still blank fails.
