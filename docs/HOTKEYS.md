# Keyboard Shortcuts

> Shortcuts fire only when focus is **not** inside an input, textarea, select, or contenteditable field.
> `Cmd` on macOS · `Ctrl` on Windows/Linux.

---

## Global (any tab)

| Shortcut               | Action                      |
| ---------------------- | --------------------------- |
| `Option/Alt + 1`       | Switch to Reader tab        |
| `Option/Alt + 2`       | Switch to Translator tab    |
| `Option/Alt + 3`       | Switch to Dictionary tab    |
| `Option/Alt + 4`       | Switch to Rules tab         |
| `Option/Alt + 5`       | Switch to Configuration tab |
| `Option/Alt + 6`       | Switch to Appearance tab    |
| `Cmd/Ctrl + Z`         | Undo                        |
| `Cmd/Ctrl + Shift + Z` | Redo                        |

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

The Add shortcuts (`Cmd/Ctrl + 1`–`6`) work here too, unchanged; `Cmd/Ctrl + 7` (new
Transform Rule) is the Translator's alone. Two of them already mean
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

Add (1–7) pre-fills the entry/rule form with the current text selection, if any — for
Cmd/Ctrl+7 that's the rule's Key.

---

## Dictionary tab

| Shortcut       | Action                                                      |
| -------------- | ----------------------------------------------------------- |
| `Cmd/Ctrl + L` | Focus search input                                          |
| `Cmd/Ctrl + 1` | Switch to Characters dictionary                             |
| `Cmd/Ctrl + 2` | Switch to Phrases dictionary                                |
| `Cmd/Ctrl + 3` | Switch to Proper Nouns dictionary                           |
| `Cmd/Ctrl + 4` | Switch to Patterns dictionary                               |
| `Cmd/Ctrl + 5` | Switch to default custom proper noun (set in Configuration) |
