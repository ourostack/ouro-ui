# Account settings

Build the account settings page. People use it to change how they appear to other cooks and how we contact them. The server validates everything, and its messages have to land on the right field, because "something went wrong" at the top of a long form is what people complain about most today.

## What to build

- A page titled "Account settings" with one form.
- Load the current settings with `loadSettings()` from `src/api/settings.ts` and show them in the form. Save with `saveSettings(values)`. It answers either `{ ok: true, settings }` or `{ ok: false, errors }`, where `errors` maps a field name to the server's message.
- The server is the source of truth for validation. You may also check on the client, but every message the server sends must show.

## Acceptance

1. The form has these fields, in this order, each with a visible label: "Display name" (text), "Email" (email), "Username" (text), "Bio" (several lines, with the hint "Up to 160 characters."), "Time zone" (a choice from `timeZones`) and a checkbox "Email me product news". Once the settings load, the fields show them.
2. A "Save changes" button sends the form with `saveSettings`. While the request runs, the button shows that it is saving, and the form can't be sent a second time, by clicking or by pressing Enter.
3. When the server returns errors, each message shows under its own field, the field is marked invalid for assistive technology and its message is read with it, and focus moves to the first field with an error.
4. Correcting a field and saving again clears the messages the server no longer returns.
5. After a successful save, the message "Settings saved" appears and is announced to screen readers.
6. The page works with a keyboard alone, reads well at 390px and 1280px wide, and looks right in light and dark mode.
