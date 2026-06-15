# Audit WCAG AA — RobLaude

> Audit d'accessibilité automatisé via axe-core (tags `wcag2a` + `wcag2aa`),
> rejoué en CI par `web/frontend/e2e/wcag-audit.spec.ts` (desktop + mobile).

## Périmètre

Pages clés auditées : Login, Dashboard, Missions, Nouvelle mission,
Admin objets, Profil.

## Résultat

Aucune violation WCAG AA sur les 6 pages, en desktop et mobile.

## Correctifs apportés

- **Missions** — les `<select>` de filtre (statut, type) n'avaient pas de nom
  accessible → ajout d'`aria-label` (`select-name`).
- **Missions** — le tableau scrollable horizontalement n'était pas atteignable
  au clavier en mobile → `tabIndex={0}` + `role="region"` + `aria-label`
  (`scrollable-region-focusable`).

## Limites

- L'audit automatique couvre contraste, noms accessibles, rôles/landmarks ARIA
  et structure. Il ne remplace pas un passage lecteur d'écran ni un test manuel
  de navigation clavier de bout en bout.
- Les vues 3D / canvas (carte SLAM, bras, caméra) ne sont pas analysées par axe.
