# Changes in this release

- Fixed: Ouro check's `dark-miss` [follows a token a component re-points in an element's own style, from the nearest element that declares it](test/check-theme-in-page.test.ts "verify:testExists(test/check-theme-in-page.test.ts::findThemeIssues: dark-miss > follows a token an element's own style re-points, as Message's bubble does, and finds one that leads to no dark value)"), so a chat bubble filled from the theme's primary passes in a dark theme.
