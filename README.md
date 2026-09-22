# Om-LifeOS v1.8.13 — Accessibility Clean

Fresh clean build based on the deep-audited v1.8.13 project.

## Final hardening
- Generated form controls receive stable `id` and `name` attributes.
- Controls receive an accessible name when one was missing.
- Sibling text labels are automatically associated with their control.
- A MutationObserver covers dynamically rendered menus, calculator tools, modals and import dialogs.
- Existing calculator, finance, import/export, Life Balance and Tauri source structure is preserved.

## Verification
- JavaScript syntax checked.
- ZIP integrity checked.
- `src/index.html` is byte-identical to the standalone HTML in the release.


## v1.8.14 storage/export fix
- Export menu selection is now genuinely user-controlled (Select All / Clear All / individual checkboxes).
- Life Balance and Universal Calculator are included in section selection/export.
- Browser/local HTML mode now has a working JSON backup/restore fallback instead of a native-SQLite-only warning.
- Browser database status reports IndexedDB health accurately.


## v1.8.20 Daily Planner Fix
- Point-wise actions are visible in the main Daily Planner card.
- Save Plan performs an immediate daily-section persistence attempt.
- Add/complete/delete point actions persist immediately.
- Native SQLite daily section and browser fallback are both handled.
