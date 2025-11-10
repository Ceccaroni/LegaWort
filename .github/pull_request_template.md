## Summary
- _write a brief summary of changes_

## Checklist
- [ ] Confirmed that no changes were made under `public/data/defs/aa/` (aa is a regression test; do not overwrite it).
---

## Declared Scope (dynamisch)
Trage GENAU die Pfade/Dateien ein, die dieser PR ändern darf.
Alles ausserhalb gilt als ausser Scope (wird vom Guard geprüft).

<!-- SCOPE-START -->
**Allowed paths:**
- public/data/**           <!-- Beispiel: Datenimporte -->
- tools/**                 <!-- Beispiel: Skripte/Importer -->
<!-- SCOPE-END -->

**Begründung (kurz):**
- Warum sind diese Pfade nötig?

---

## Stabiler Bereich (nur gezielt)
- Änderungen an **Core/UI** (`index.html`, `web/**`) nur **gezielt** und **minimal**.
- Wenn nötig: Label **core-edit** setzen und Grund im Summary nennen.

---

## Checkliste – keine sinnlosen Überschreibungen
- [ ] Bestehende Funktionen **nicht gelöscht/umbenannt**; neue Logik additiv (Suffix `V2`).
- [ ] Neue Aufrufe mit `try/catch` + Fallback auf bestehende Funktion.
- [ ] Suche bleibt **nur Headword** (kein Volltext), falls Suche betroffen.
- [ ] Seite lädt ohne rote Fehler (Konsole), Basis-Flows laufen.

## Labels
- Optional: `core-edit` (gezielte Core/UI-Änderung), `wide-scope` (bewusst breiter Scope).
