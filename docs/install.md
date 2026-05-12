# Installation — PennyPilot v0.2.1

Guide d'installation de l'extension PennyPilot dans Claude Desktop.

> Pour la documentation complète (sécurité, FAQ, troubleshooting), voir https://apps.holco.co/mcp/pennylane/docs/install

---

## Pré-requis

- **Claude Desktop** Mac ou Windows (versions 2025+) — téléchargement : https://claude.ai/download
- **Une clé HOLCO** (format `HOLCO-XXXX-XXXX-XXXX-XXXX`) reçue par email depuis `alan@holco.co` après inscription pilote sur https://apps.holco.co/mcp/pennylane/cgu
- **Un Company API Token Pennylane v2** généré sur le dossier client de test : Pennylane → Paramètres → Connectivité → Développeurs → API v2

---

## Installation en 3 étapes

### 1. Télécharger le bundle

Depuis votre page d'accès personnelle (lien dans l'email d'accueil), ou directement :

https://apps.holco.co/downloads/pennypilot-0.2.1.mcpb

### 2. Drag-drop dans Claude Desktop

- Glissez `pennypilot-0.2.1.mcpb` sur la fenêtre de Claude Desktop, OU
- Settings → MCP Extensions → Install Extension → sélectionnez le fichier

#### ⚠️ Warning Anthropic à l'installation

Claude Desktop affichera ce message :

> « Les informations sur le développeur affichées n'ont pas été vérifiées par Anthropic. »

**C'est normal.** Toutes les extensions tierces non listées dans le directory officiel Anthropic affichent ce message, indépendamment de leur qualité.

**Sources de confiance vérifiables :**

- Code source : https://github.com/holco-apps/pennypilot (public, vous y êtes)
- Société : HOLCO, immatriculée à Paris (France)
- Contact direct : alan@holco.co
- Documentation sécurité : https://apps.holco.co/mcp/pennylane/docs/security

PennyPilot a été soumis au directory officiel Anthropic — la vérification est en cours (Q3 2026).

### 3. Saisir vos clés

Claude ouvre une popup demandant deux valeurs :

- **HOLCO_LICENSE_KEY** : votre clé pilote (format `HOLCO-XXXX-XXXX-XXXX-XXXX`)
- **PENNYLANE_TOKEN** : votre Company API Token v2 Pennylane

Les deux valeurs sont stockées comme **environment variables Claude Desktop** sur votre poste, jamais envoyées à HOLCO. La clé HOLCO est consultée localement sous forme de hash SHA-256 uniquement, contre le registre public https://apps.holco.co/api/licenses.json

---

## Premier test

Ouvrez une nouvelle conversation Claude Desktop et tapez :

```
Génère la note de synthèse de mai 2026 pour mon dossier.
```

Claude détecte les outils PennyPilot et appelle `generate_monthly_close_report`. Première réponse en 6 à 10 secondes.

Pour lister les outils disponibles : « Quels outils PennyPilot as-tu ? » — doit retourner :

- `find_unpaid_customer_invoices`
- `get_company_pnl`
- `generate_monthly_close_report`

---

## Désinstaller

Settings → MCP Extensions → PennyPilot → Remove

Le serveur MCP s'arrête, votre token Pennylane est purgé des variables d'environnement Claude Desktop. Les conversations passées restent visibles mais l'outil ne peut plus interroger Pennylane.

---

## Support

- Question produit, support, bug : alan@holco.co
- Issues GitHub : https://github.com/holco-apps/pennypilot/issues
- Documentation complète : https://apps.holco.co/mcp/pennylane/docs/install
