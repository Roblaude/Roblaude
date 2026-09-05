# Dossier de conception B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire un dossier individuel de conception RobLaude, éditable en DOCX et livré en PDF, qui couvre explicitement C1.1, C1.2 et C1.3.

**Architecture:** Le contenu est rédigé dans un module source unique, tandis que les diagrammes sont générés séparément à partir de descriptions versionnables. Un constructeur DOCX applique un système visuel A4 cohérent, intègre le contenu et les figures, puis le renderer officiel produit le PDF et les PNG de contrôle.

**Tech Stack:** Python 3 fourni par le runtime Codex, python-docx, Pillow, Graphviz, LibreOffice, Poppler.

**Spec:** `docs/superpowers/specs/2026-08-22-dossier-conception-bloc1-design.md`

## Global Constraints

- Présenter distinctement la cible initiale, les choix, la réalisation validée, les limites et les axes d'amélioration.
- Ne présenter comme testé sur le robot réel que ce qui est attesté dans les sources du dépôt.
- Employer la nomenclature MQTT de `docs/mqtt-spec.md` et le matériel documenté dans `docs/architecture.md`.
- Produire quatre diagrammes lisibles en A4 : cas d'utilisation, composants, séquence UC-01 et états de mission.
- Utiliser le preset `narrative_proposal` avec un en-tête `editorial_cover`, adapté en A4.
- Ne pas modifier le code applicatif RobLaude.
- Ne créer aucun commit dans ce plan.

---

### Task 1: Consolider les faits et la traçabilité

**Files:**
- Create: `deliverables/bloc1/sources/fact-check.md`

**Interfaces:**
- Consumes: `docs/CDC_Roblaude_v1.2.md`, `docs/architecture.md`, `docs/mqtt-spec.md`, `docs/ROBOT.md`, `docs/ROADMAP.md`, `docs/DIFFICULTES_ROBOT.md`, `docs/DETTE.md`, le code actuel.
- Produces: une matrice factuelle distinguant besoin, conception, implémentation, validation et limite.

- [ ] **Step 1: Relever les affirmations structurantes**

Créer une matrice avec les colonnes `Sujet`, `Affirmation`, `Niveau`, `Source`, `Usage dans le dossier`.

- [ ] **Step 2: Vérifier les affirmations sensibles dans le code**

Run: `rg -n "create_(publisher|subscription)|mqtt|WebSocket|prisma|scan_fixed|slam_toolbox" robot web docs`

Expected: chaque affirmation technique structurante possède une source documentaire ou une implémentation localisable.

- [ ] **Step 3: Contrôler l'absence de contradiction**

Comparer notamment Orbbec/RealSense, topics MQTT anciens/actuels, fonctionnalités prévues/réalisées et branche de référence.

### Task 2: Produire les diagrammes cohérents

**Files:**
- Create: `deliverables/bloc1/diagrams/build_diagrams.py`
- Create: `deliverables/bloc1/diagrams/use-cases.png`
- Create: `deliverables/bloc1/diagrams/components.png`
- Create: `deliverables/bloc1/diagrams/sequence-uc01.png`
- Create: `deliverables/bloc1/diagrams/mission-states.png`

**Interfaces:**
- Consumes: acteurs, composants, topics et états consolidés par Task 1.
- Produces: quatre PNG haute définition avec fond blanc, palette commune et libellés français.

- [ ] **Step 1: Définir les quatre graphes**

Le diagramme de composants doit montrer `PWA -> API -> MySQL`, `API <-> Mosquitto <-> bridge ROS 2`, puis les nœuds navigation, perception et actionnement.

- [ ] **Step 2: Générer les PNG**

Run: `python deliverables/bloc1/diagrams/build_diagrams.py`

Expected: quatre images PNG non vides, largeur minimale 1800 px.

- [ ] **Step 3: Vérifier les libellés**

Run: `python -c "from PIL import Image; import glob; print([(p, Image.open(p).size) for p in glob.glob('deliverables/bloc1/diagrams/*.png')])"`

Expected: quatre dimensions valides et aucun schéma absent.

### Task 3: Rédiger le dossier et construire le DOCX

**Files:**
- Create: `deliverables/bloc1/build_dossier.py`
- Create: `deliverables/bloc1/Dossier_Conception_B1_RobLaude_Wissem.docx`

**Interfaces:**
- Consumes: matrice factuelle et diagrammes des Tasks 1 et 2.
- Produces: un DOCX A4 complet avec couverture, sommaire statique, corps, figures, tableaux, conclusion et sources.

- [ ] **Step 1: Définir les styles du document**

Appliquer le preset `narrative_proposal` : corps 11 pt, interligne 1,333, titres hiérarchisés, marges de 2,2 cm, palette bleu pétrole, corail discret et gris clair.

- [ ] **Step 2: Rédiger les treize sections**

Chaque chapitre doit répondre à une question claire et intégrer les arbitrages, conséquences, limites et preuves utiles sans formules génériques.

- [ ] **Step 3: Intégrer figures et tableaux**

Ajouter les quatre figures avec légendes et un tableau de traçabilité `Besoin -> Réponse -> Validation -> Limite`.

- [ ] **Step 4: Générer le DOCX**

Run: `python deliverables/bloc1/build_dossier.py`

Expected: le DOCX existe, dépasse 100 Ko et s'ouvre avec python-docx.

### Task 4: Auditer le contenu et la structure

**Files:**
- Inspect: `deliverables/bloc1/Dossier_Conception_B1_RobLaude_Wissem.docx`

**Interfaces:**
- Consumes: DOCX de Task 3.
- Produces: validation structurelle avant rendu.

- [ ] **Step 1: Extraire et relire le texte**

Run: `python -c "from docx import Document; d=Document('deliverables/bloc1/Dossier_Conception_B1_RobLaude_Wissem.docx'); print('\n'.join(p.text for p in d.paragraphs))"`

Expected: aucune section vide, aucun marqueur interne et aucune affirmation contredisant la matrice.

- [ ] **Step 2: Vérifier les expressions interdites**

Run: `rg -n "TODO|TBD|Lorem|en tant qu'IA|il est important de noter|révolutionnaire" deliverables/bloc1`

Expected: aucun résultat dans le contenu final.

- [ ] **Step 3: Lancer les audits DOCX**

Run: `python /Users/wissem/.codex/plugins/cache/openai-primary-runtime/documents/26.819.11345/skills/documents/scripts/a11y_audit.py deliverables/bloc1/Dossier_Conception_B1_RobLaude_Wissem.docx`

Expected: aucune erreur bloquante sur les figures, les tableaux et la hiérarchie.

### Task 5: Générer et vérifier le PDF final

**Files:**
- Create: `output/pdf/Dossier_Conception_B1_RobLaude_Wissem.pdf`
- Create: `output/docx/Dossier_Conception_B1_RobLaude_Wissem.docx`
- Create: `deliverables/bloc1/render/page-*.png`

**Interfaces:**
- Consumes: DOCX audité de Task 4.
- Produces: PDF final et source éditable prêts à rendre.

- [ ] **Step 1: Rendre le document**

Run: `env TMPDIR=/private/tmp python /Users/wissem/.codex/plugins/cache/openai-primary-runtime/documents/26.819.11345/skills/documents/render_docx.py deliverables/bloc1/Dossier_Conception_B1_RobLaude_Wissem.docx --output_dir deliverables/bloc1/render --emit_pdf`

Expected: un PDF et une image PNG par page.

- [ ] **Step 2: Inspecter toutes les pages**

Créer une planche de contact puis ouvrir les pages à 100 % pour détecter coupures, chevauchements, tableaux serrés, figures illisibles et ruptures de page maladroites.

- [ ] **Step 3: Corriger et rendre à nouveau**

Répéter la génération et l'inspection jusqu'à ce qu'aucun défaut visuel ne subsiste.

- [ ] **Step 4: Publier les livrables**

Copier le PDF validé dans `output/pdf/` et le DOCX source dans `output/docx/`, puis vérifier leur taille et leur nombre de pages.
