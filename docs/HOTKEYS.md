# Keyboard Shortcuts

> Shortcuts fire only when focus is **not** inside an input, textarea, select, or contenteditable field.
> `Cmd` on macOS · `Ctrl` on Windows/Linux.

---

## Global (any tab)

| Shortcut         | Action                      |
| ---------------- | --------------------------- |
| `Option/Alt + 1` | Switch to Reader tab        |
| `Option/Alt + 2` | Switch to Translator tab    |
| `Option/Alt + 3` | Switch to Dictionary tab    |
| `Option/Alt + 4` | Switch to Rules tab         |
| `Option/Alt + 5` | Switch to Configuration tab |
| `Option/Alt + 6` | Switch to Appearance tab    |

Tab switching uses Option/Alt, not `Cmd/Ctrl + Shift + 1-6` — that combo collides with a
default macOS shortcut.

The Reader took `Option/Alt + 1` and pushed the other five tabs down by one. That was a
deliberate trade — five bindings already in muscle memory changed — made because the
Reader is where the app should land.

---

## Reader tab

| Shortcut       | Action                                          |
| -------------- | ----------------------------------------------- |
| `Cmd/Ctrl + K` | Open the command palette                        |
| `Cmd/Ctrl + G` | Jump to chapter (outline, search focused)       |
| `[` / `]`      | Previous / next chapter                         |
| `Space`        | Page the reading panel down                     |
| `Shift+Space`  | Page the reading panel up                       |
| `Cmd/Ctrl + B` | Dictionaries for this book (the binding dialog) |

`[` and `]`, and `Space`/`Shift+Space`, carry no modifier, so all four are inert while a
text input or content-editable element has focus — otherwise they would fire while you
type a literal bracket or a space into a search box or a dictionary entry. Space is
dispatched by the same hotkey handler as everything else here rather than left to the
browser's own scroll-the-focused-element behavior, which loses track of the panel once a
virtualized row holding focus scrolls out of the DOM.

The command palette offers every action in this section except opening itself, plus
switching books, reopening the open book with a different encoding (no shortcut), and the
Add shortcuts below, and each of its rows shows the direct shortcut it stands for — so it is also where those shortcuts are discovered. Typing filters; Escape closes; Enter runs the highlighted
row. The Add rows start from what the Add shortcuts would at the moment the palette opened
(focusing its search collapses the selection): a Translation-panel selection's Chinese, any
other selection's text, else the clipboard. A selection the shortcut would refuse makes the
Add rows show the same toast.

The Add shortcuts (`Cmd/Ctrl + 1`–`7`, and `Cmd/Ctrl + Shift + N`) work here too, unchanged,
as does `Cmd/Ctrl + R`. `Cmd/Ctrl + Shift + V` does not: it fills the Translator's input,
and a translation started from a hidden Translator would run beside the Reader's own. Two
of the Add shortcuts already mean
"the active fiction's dictionaries"; binding a book is what makes that phrase reliable
instead of dependent on having remembered to change a setting in Configuration.

---

## Translator tab

| Shortcut               | Action                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `Cmd/Ctrl + Shift + V` | Translate from clipboard                                      |
| `Cmd/Ctrl + Shift + N` | Add entry (proper nouns), the same as `Cmd/Ctrl + 3`          |
| `Cmd/Ctrl + R`         | Reload all dictionaries                                       |
| `Cmd/Ctrl + 1`         | Add → Characters dictionary                                   |
| `Cmd/Ctrl + 2`         | Add → Phrases dictionary                                      |
| `Cmd/Ctrl + 3`         | Add → Proper Nouns dictionary                                 |
| `Cmd/Ctrl + 4`         | Add → Patterns dictionary                                     |
| `Cmd/Ctrl + 5`         | Add → default custom proper noun (set in Configuration)       |
| `Cmd/Ctrl + 6`         | Add → default structural patterns dictionary (active fiction) |
| `Cmd/Ctrl + 7`         | Add → new Transform Rule (Rules tab)                          |

Add (1–7) pre-fills the entry/rule form with the current text selection — for Cmd/Ctrl+7
that's the rule's Key. With nothing selected it takes what is on the clipboard instead. The
selection is never copied to the clipboard, so what you had copied survives the key press.
The Dictionary tab's Add button opens an empty form.

Cmd/Ctrl+3 and Cmd/Ctrl+4 (and Cmd/Ctrl+Shift+N) open with a row of buttons in the form's
header, beside the dictionary menu: the base dictionary plus every active generic (`_Theme`) dictionary —
the proper-nouns ones for 3, their pattern halves for 4. Fiction is left out; 5 and 6 reach
it. Inside the form, press the opening key again to step to the next button, or
Option+1–9 to jump to one. Typed text is kept. The next Cmd/Ctrl+3 (or 4) opens on the
last one you picked, while it is still active; this is remembered until the app quits.

In any Add form (1–7), Cmd/Ctrl+Enter saves from any field — the same as clicking Save, so
it does nothing while Save is disabled. In the dictionary Add form, Option+G replaces the
translation with the word-by-word gloss shown under it, and Option+F with the Full Translation
line below that (shown when the Add opened from the Translator or the Reader).

With focus on a semantic-type badge (Tab to it), a digit toggles the badge at that position —
the digits show on the badges while focus is there. Semantic type: 0 None, 1 CHA, 2 CRE,
3 LOC, 4 ORG, 5 CON, 6 OBJ, then 7 `$X` and 8 `$Y` on patterns. In a pattern's "X accepts" /
"Y accepts" row, 1–6 tick the same six types for that variable and 0 clears it back to any. Each badge row is a single Tab
stop — Tab/Shift+Tab move to the next or previous part of the form, and the arrow keys move
between badges within a row.

A selection in the Translator's Full Translation panel or the Reader's Translation panel is
Vietnamese, so Add first maps it back to Chinese: it snaps to the whole units it touches and
pre-fills the Chinese they cover in the source, gaps included. The Translation field
is guessed from that Chinese as usual — a matching Transform Rule first, then the character
gloss — never from the selected Vietnamese. A selection
spanning more than one line is refused with a toast. See "Selection mapping" in `GLOSSARY.md`.

---

## Dictionary tab

| Shortcut               | Action                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `Cmd/Ctrl + L`         | Focus search input                                          |
| `Cmd/Ctrl + 1`         | Switch to Characters dictionary                             |
| `Cmd/Ctrl + 2`         | Switch to Phrases dictionary                                |
| `Cmd/Ctrl + 3`         | Switch to Proper Nouns dictionary                           |
| `Cmd/Ctrl + 4`         | Switch to Patterns dictionary                               |
| `Cmd/Ctrl + 5`         | Switch to default custom proper noun (set in Configuration) |
| `Cmd/Ctrl + Z`         | Undo the last dictionary edit                               |
| `Cmd/Ctrl + Shift + Z` | Redo                                                        |

Undo and redo act on the app-wide edit history, quick-adds from the Translator and Reader
included, but only here: this is the one tab that shows what was undone, or that it failed.
