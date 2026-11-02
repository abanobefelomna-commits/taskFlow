# TaskFlow Pro

A polished, offline-first to-do list app. No build step, no sign-up, no dependencies — just open `index.html` in a browser.

## Run it

Double-click `index.html`, or serve the folder:

```bash
npx serve .
```

Everything is stored locally in your browser. The app ships with a small sample workspace so you can explore right away — clear it with **Data → Reset all data**.

## What's inside

- **Views** — Inbox, Today (with overdue), Upcoming (grouped by day), Completed, plus colour-coded projects.
- **Quick add** — type naturally: `Pay rent @tomorrow !1 #Personal`. Tokens are parsed live before you hit Enter.
- **Task details** — notes, due date, priority (P1–P4), project, tags, and subtasks with their own progress.
- **Organise** — drag to reorder, sort by due date, priority, or name, and search across every task.
- **Finish things** — animated check-offs, confetti, completion toasts with undo, and a daily progress ring.
- **Light / dark theme** — follows your system by default, remembered afterwards.
- **Backup** — export/import the whole workspace as JSON.
- **Responsive** — works on phones with a slide-out navigation drawer and full-screen task details.
- **Accessible details** — keyboard navigable, focus traps in dialogs, reduced-motion support, ARIA state on checkboxes.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New task |
| `/` | Focus search |
| `G` then `T` | Go to Today |
| `G` then `C` | Go to Completed |
| `G` then `I` | Go to Inbox |
| `Esc` | Close drawer / dialog / search |
| `?` | Shortcut cheat sheet |

## Files

```
index.html   Markup, inline SVG icon sprite, dialogs, drawer
styles.css   Design system, light/dark themes, responsive layout
app.js       State, rendering, date parsing, interactions, localStorage
```

## Notes

- Data lives under the `taskflow.pro.v1` localStorage key for this browser/origin.
- Opening the file directly uses a `file://` origin; some browsers treat each file origin separately. Serving the folder (or hosting it) keeps storage and downloads consistent.
- Dates are handled in local time; the first day of the week follows your locale.
