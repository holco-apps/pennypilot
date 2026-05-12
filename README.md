# PennyPilot

**Le copilote IA pour cabinets d'expertise comptable sur Pennylane.**

Extension MCP (Model Context Protocol) qui se branche à Claude Desktop et expose l'API Pennylane v2 comme outils accessibles à la conversation IA du collaborateur. Production de la note de synthèse mensuelle d'un dossier client en 8 secondes au lieu de 1h30.

Édité par **HOLCO**, Paris · v0.2.0 (béta restreinte) · pilote en cours

- **Page produit** : https://apps.holco.co/mcp/pennylane
- **Inscription pilote** : https://apps.holco.co/mcp/pennylane/cgu
- **Sécurité & RGPD** : https://apps.holco.co/mcp/pennylane/docs/security
- **Contact** : alan@holco.co

---

## ⚠️ À l'installation, ce que Claude Desktop affichera

Au moment du double-clic sur le bundle `.mcpb`, Claude Desktop affichera ce warning d'Anthropic :

> « Les informations sur le développeur affichées n'ont pas été vérifiées par Anthropic. »

**C'est normal.** Toutes les extensions tierces non listées dans le directory officiel Anthropic affichent ce message, indépendamment de leur qualité. PennyPilot a été soumis au directory officiel Anthropic — la vérification est en cours (Q3 2026).

**Sources de confiance vérifiables :**

| | |
|---|---|
| Code source (ce repo) | [github.com/holco-apps/pennypilot](https://github.com/holco-apps/pennypilot) (public) |
| Société éditrice | **HOLCO**, immatriculée à Paris (France) |
| Contact direct | alan@holco.co |
| Documentation sécurité | [apps.holco.co/mcp/pennylane/docs/security](https://apps.holco.co/mcp/pennylane/docs/security) |
| Procédure RGPD | [apps.holco.co/mcp/pennylane/cgu](https://apps.holco.co/mcp/pennylane/cgu) |

---

## Pour installer (utilisateur final cabinet)

1. **Inscrivez-vous au pilote** sur https://apps.holco.co/mcp/pennylane/cgu (lecture obligatoire des CGU avant le formulaire).
2. **HOLCO valide manuellement** chaque demande sous 24 h (programme pilote restreint à 5 cabinets).
3. **Vous recevez un email** depuis `alan@holco.co` avec votre clé HOLCO + le lien de téléchargement du bundle.
4. **Drag-drop** le fichier `pennypilot-0.2.0.mcpb` dans Claude Desktop, saisissez la clé HOLCO + votre token Pennylane v2 → installation en 30 secondes.

Procédure détaillée : [`docs/install.md`](docs/install.md)

---

## Tools exposés (v0.2)

| Tool | Rôle |
|---|---|
| `find_unpaid_customer_invoices(days_overdue, company_id?)` | Résumé chiffré + top 20 factures clients en retard |
| `get_company_pnl(period, company_id?)` | P&L synthétique mois/trimestre/année, comparatif vs N-1 |
| `generate_monthly_close_report(company_id, month, tone?)` | Note de synthèse mensuelle complète (playbook 6 sections) |

Lecture seule en v0.2. Les outils d'écriture (lettrage, génération de facture, validation `preview → commit` obligatoire) arrivent en Q4 2026.

---

## Architecture

- **Runtime** : Node.js ≥ 20, transport stdio (Claude Desktop) ou Streamable HTTP (Mistral Le Chat, ChatGPT Business — v0.3)
- **Distribution** : bundle `.mcpb` (convention Anthropic) téléchargé depuis apps.holco.co après inscription pilote
- **Token Pennylane** : stocké comme variable d'environnement Claude Desktop sur le poste du collaborateur, **jamais transmis à HOLCO**
- **Clé HOLCO** : sert uniquement à valider l'éligibilité au pilote. Seul le hash SHA-256 est consulté contre le registre public [apps.holco.co/api/licenses.json](https://apps.holco.co/api/licenses.json)
- **Aucune donnée comptable** ne transite par les serveurs HOLCO — l'extension parle directement à l'API Pennylane v2

---

## Sécurité

Voir https://apps.holco.co/mcp/pennylane/docs/security pour le détail. Points clés :

- ✓ Aucune donnée comptable côté HOLCO
- ✓ Token Pennylane local (variable d'env Claude Desktop)
- ✓ Lecture seule stricte en v0.2
- ✓ Pas d'entraînement IA (opt-out contractuel Anthropic)
- ✓ Compatible AI Act européen (UE 2024/1689)

---

## Statut

- **Aujourd'hui** : v0.2.0 disponible, pilote restreint en cours (5 cabinets max)
- **Q3 2026** : adapters Streamable HTTP (Mistral Le Chat, ChatGPT Business)
- **Q4 2026** : outils d'écriture (lettrage, facturation) avec validation systématique
- **Q1 2027** : Firm Token multi-dossier
- **Q3 2026** : vérification officielle au directory Anthropic (soumission faite)

---

## Licence

Propriétaire — voir [`LICENSE`](LICENSE). Reverse engineering, redistribution et exploitation commerciale interdits sauf accord écrit HOLCO.

---

## Contact

- **Questions produit, installation, support** : alan@holco.co
- **Commercial / partenariats** : alan@holco.co
- **Issues techniques** : ouvrir un GitHub Issue sur ce repo

HOLCO · Paris, France · https://holco.co
