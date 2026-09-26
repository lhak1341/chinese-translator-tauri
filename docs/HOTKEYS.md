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
switching books and the Add shortcuts below, and each of its rows shows the direct
shortcut it stands for — so it is also where those shortcuts are discovered. Typing filters; Escape closes; Enter runs the highlighted
row. The Add rows carry the text selected in the reading view at the moment the palette
opened, since focusing its search collapses the selection.

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
| `Cmd/Ctrl + Shift + N` | Add entry (proper nouns)                                      |
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

A selection in the Translator's Full Translation panel or the Reader's Translation panel is
Vietnamese, so Add first maps it back to Chinese: it snaps to the whole units it touches and
pre-fills the Chinese they cover in the source, gaps included. The Translation field
is guessed from that Chinese as usual — a matching Transform Rule first, then the character
gloss — never from the selected Vietnamese. A selection
spanning more than one line is refused with a toast. See "Selection mapping" in `CONTEXT.md`.

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
