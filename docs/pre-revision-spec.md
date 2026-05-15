# PennyPilot v0.2.9 — Pré-révision (`generate_revision_triage`)

Cadrage produit avant implémentation. Validé par Pierre 2026-05-15.

## Objectif (1 phrase)

> En 60 secondes, le collaborateur sait quels comptes/dossiers bloquent la révision du mois, quelles preuves manquent, quels écarts sont à documenter, et quelles demandes client préparer.

Strictement read-only. Produit une checklist + des drafts à copier dans le dossier de travail Pennylane. Ne lettre rien, ne crée rien.

## Tool MCP

- **Nom technique** : `generate_revision_triage`
- **Naming user-facing** : « Pré-révision »
- **Inputs** :
  - `period` (string, requis) — `YYYY-MM`, `YYYY-Qn`, ou `YYYY` pour exercice fiscal.
  - `scope` (enum) — `monthly_review` (défaut) / `closing` / `supervision`.
  - `materiality_threshold_eur` (number, optionnel) — défaut 100 ; à terme calculé depuis revenu/charges.
  - `include_client_requests` (bool, défaut true) — produire ou non la section « Demandes client ».
- **Annotations** : `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true`.

## Output — 5 sections obligatoires, ordre fixe

### 1. Synthèse d'urgence
- `readiness_score` : `Prêt` / `À revoir` / `Bloquant`.
- Top 5 blockers triés par matérialité × ancienneté.
- Focus de révision attendu : bank / 411 / 401 / cut-off / TVA / paie / immo / produits.

### 2. Points bloquants par cycle
- Clients/411 : factures impayées > seuil, 411 non lettrés, avoirs non rapprochés.
- Fournisseurs/401 : 401 non lettrés, fournisseurs en doublon, balances anciennes.
- Banque/512 : si scopes transactions disponibles → mouvements sans pièce ; sinon placeholder « lecture banque limitée ».
- Charges/6 : variations N-1 significatives, charges récurrentes manquantes.
- Produits/7 : drops/spikes CA, séquence numérotation factures.
- Paie/64, taxes/63 : variation pattern mensuel.
- Immo/2, emprunts/16 : v0.2.9 → flags sur balance uniquement, pas de détail.

### 3. Demandes client préparées
- Liste de drafts à copier dans Pennylane (NON envoyés).
- Groupées par client/sujet pour éviter le harcèlement.
- Format : « Merci de déposer X » / « Pouvez-vous confirmer Y » / « Pouvez-vous expliquer l'écart Z ».

### 4. Commentaires de révision pré-rédigés
- Court paragraphe par compte/cycle, labellé `DRAFT — à valider par le cabinet`.
- Sources explicites (endpoint Pennylane consulté + période).
- Limitations connues (« scope X non disponible, donnée Y manquante »).

### 5. Audit trail / vérification
- Endpoints Pennylane consultés (chemin + paramètres + count).
- Séparation stricte du output contract anti-hallucination :
  - **Faits Pennylane** (chiffres bruts).
  - **Calculs déterministes** (formules appliquées).
  - **Hypothèses** (seuils, scope par défaut, etc.).
  - **Limites** (endpoints absents, scopes manquants, périodes partielles).
  - **Recommandations** (drafts produits).
- Footer : `À valider par le cabinet. Aucune modification effectuée sur Pennylane.`

## Endpoints Pennylane composés (v0.2.9 MVP, Company Token)

Réutilisation des fetchers existants :
- `/me`
- `/trial_balance?period_start=...&period_end=...`
- `/customer_invoices` (paginate)
- `/supplier_invoices` (paginate)
- `/customers` (paginate) → map id→name
- `/suppliers` (paginate) → map id→name
- `/ledger_entries/*` → 411 et 401 non lettrés (filtrer côté client si filter API non dispo)
- `/fiscal_years` (paginate)
- `/journals` (paginate)
- `/ledger_accounts` (paginate)

À AJOUTER si scopes le permettent (sinon V0.3+) :
- `/transactions` (lecture banque)
- `/file_attachments` (preuves)

## Garde-fous

- `assertHolcoLicense()` au début du handler (côté business tool, donc gating actif).
- Context-guard SIREN/NAF appelé en amont (réutilise `lib/context-guard.js`) — refus si dossier non confirmé.
- Tous les libellés (`label`, `customer_name`, etc.) escapés avant markdown output (anti-injection).
- Pas de write Pennylane. Pas de lecture en dehors des endpoints listés.

## Tests requis

- Fixture trial_balance avec lignes 411/401 non lettrées.
- Fixture factures clients impayées > seuil.
- Fixture facture fournisseur en doublon.
- Fixture charges récurrentes manquantes (vs N-1).
- Output snapshot : 5 sections présentes, séparation faits/calculs/hypothèses/limites/recommandations explicite.
- Test contrat : pas d'appel POST/PUT/PATCH/DELETE.

## Découpage v0.2.9 vs v0.3

- **v0.2.9 (MVP single-dossier / Company Token)** : sections 1-5 avec données disponibles aujourd'hui. Banque restreinte par défaut. Pas de portfolio.
- **v0.3** : Firm Token + `triage_portefeuille_cabinet` qui appelle ce playbook en boucle, ranking dossier-par-dossier.

## Non-buts v0.2.9

- Pas d'envoi des demandes client (drafts uniquement, à copier manuellement).
- Pas de scoring AI fancy : matérialité par seuil EUR brut.
- Pas de réconciliation auto (lettrage). On signale les anomalies, on ne les corrige pas.
- Pas de templates par cabinet : un seul template FR.

## Question ouverte avant code

- **Naming dans le code** : on s'aligne `lib/playbooks/revision-triage.js` + `lib/tools/generate-revision-triage.js` ? OK avec convention existante.
- **Period parsing** : on étend `lib/period.js` pour accepter `YYYY-Qn` et `YYYY` (aujourd'hui ne parse que `YYYY-MM`) — OK ?
- **Qui code** : Alan (cadrage déjà fait, peut continuer) ou Nora (a l'historique du repo) ? À décider.
