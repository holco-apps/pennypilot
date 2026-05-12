# Install / Désinstall — Procédure screencast-ready

Procédure pour la prise vidéo Arcade : install propre du bundle `pennylane-cabinet-0.1.1.mcpb` + désinstall propre de l'ancien si présent. À suivre dans l'ordre.

---

## 🧹 Préparation : désinstaller l'ancien bundle

L'ancienne version installée sur ton poste s'appelle **"Pennylane — Assistant cabinet"** (slug interne `local.mcpb.holco.pennylane`). Avant d'installer le nouveau, désinstalle-le pour éviter les conflits visuels et avoir un état propre pour la démo.

### Méthode 1 — Via l'UI Claude Desktop (recommandé pour la démo)

1. Ouvre **Claude Desktop**
2. **Cmd+,** ou menu **Claude → Settings**
3. Onglet **Extensions** (ou "MCP Extensions" selon la version)
4. Trouve **"Pennylane — Assistant cabinet"** dans la liste
5. Bouton **••• → Uninstall** (ou icône poubelle selon la version)
6. Confirmer la désinstallation
7. **Quitter Claude Desktop complètement** (Cmd+Q, pas juste fermer la fenêtre)

### Méthode 2 — Manuelle (si l'UI ne suffit pas)

Si la désinstallation UI laisse des traces, supprime manuellement les 3 emplacements :

```bash
# 1. Code de l'extension (~3.2 Mo)
rm -rf "$HOME/Library/Application Support/Claude/Claude Extensions/local.mcpb.holco.pennylane"

# 2. Configuration utilisateur (token + paramètres)
rm "$HOME/Library/Application Support/Claude/Claude Extensions Settings/local.mcpb.holco.pennylane.json"

# 3. Entrée dans le registre d'extensions installées
# (édite manuellement pour retirer l'entrée pennylane)
# Le fichier est : ~/Library/Application Support/Claude/extensions-installations.json
```

⚠️ **Important** : si tu fais la méthode manuelle, **Claude Desktop doit être fermé** au moment de la suppression — sinon il peut réécrire les fichiers.

### Méthode 3 — Bouton nucléaire (rare)

Si vraiment tout est cassé, tu peux **réinitialiser toutes les extensions** :

```bash
# DESTRUCTIF — supprime TOUTES les extensions installées
mv "$HOME/Library/Application Support/Claude/Claude Extensions" "$HOME/Library/Application Support/Claude/Claude Extensions.backup-$(date +%Y%m%d)"
mv "$HOME/Library/Application Support/Claude/Claude Extensions Settings" "$HOME/Library/Application Support/Claude/Claude Extensions Settings.backup-$(date +%Y%m%d)"
```

À ne faire que si tu as une vraie raison — ça supprimera aussi PowerPoint, Apple Notes, Spark, etc.

---

## ✅ Vérification de la désinstallation

Avant de continuer, **vérifie** que l'ancien bundle a bien disparu :

```bash
ls "$HOME/Library/Application Support/Claude/Claude Extensions/" | grep -i pennylane
# Doit ne rien retourner (ou "No such file or directory")

ls "$HOME/Library/Application Support/Claude/Claude Extensions Settings/" | grep -i pennylane
# Idem
```

Si quelque chose remonte, supprime manuellement avant de continuer.

---

## 📥 Installation propre du nouveau bundle

### Étape 1 — Localiser le bundle

Le fichier `.mcpb` est à :

```
/Users/pcoquard/Documents/HOLCO/MCP/pennylane-mcp/pennylane-cabinet-0.1.1.mcpb
```

Tu peux le déplacer sur ton bureau pour la démo si tu veux une animation drag-drop plus visible.

### Étape 2 — Installation Claude Desktop

**Option A — Double-clic (le plus simple)**

1. Double-clic sur `pennylane-cabinet-0.1.1.mcpb` depuis le Finder
2. macOS ouvre automatiquement Claude Desktop
3. Claude affiche une popup : *"Install Pennylane Cabinet from HOLCO?"*
4. Cliquer **Install**

**Option B — Drag-drop**

1. Ouvrir Claude Desktop sur une conversation vide
2. Faire glisser `pennylane-cabinet-0.1.1.mcpb` directement dans la fenêtre
3. Même popup que ci-dessus

**Option C — Via Settings (le plus visible pour la démo)**

1. Claude Desktop → **Cmd+,** → onglet **Extensions**
2. Bouton **Install from File...** (ou similaire)
3. Sélectionner `pennylane-cabinet-0.1.1.mcpb`

### Étape 3 — Saisie du token

Après le clic sur **Install**, Claude affiche le formulaire user_config avec :

- **Token API Pennylane v2** *(champ masqué, type password)*
- **ID du dossier Pennylane** *(optionnel — laisser vide pour la démo)*

Coller le token (pour la démo, utiliser le token sandbox que tu as déjà : commence par `QM-rnAY6...`).

### Étape 4 — Validation

1. Cliquer **Install** (ou **Save** / **Enable**)
2. Claude charge l'extension et redémarre automatiquement le serveur MCP en arrière-plan
3. Une nouvelle conversation devrait afficher **"Pennylane Cabinet"** dans la liste des MCPs

---

## ✅ Vérification post-installation (pour démo Arcade)

Avant de démarrer la capture Arcade, **vérifier en 30 secondes** que tout marche :

### Test 1 — Présence de l'extension

```bash
ls "$HOME/Library/Application Support/Claude/Claude Extensions/" | grep -i pennylane-cabinet
# Doit afficher : local.mcpb.holco.pennylane-cabinet (ou similaire)
```

### Test 2 — Tools exposés

1. Ouvrir une nouvelle conversation Claude Desktop
2. Cliquer sur l'icône MCP en bas du composer
3. Vérifier que **"Pennylane Cabinet"** apparaît dans la liste
4. Cliquer dessus pour déplier — les 3 tools doivent apparaître :
   - `find_unpaid_customer_invoices`
   - `get_company_pnl`
   - `generate_monthly_close_report`

### Test 3 — Appel de bout en bout

Tape ce prompt simple pour valider la chaîne complète :

```
Quels outils Pennylane Cabinet as-tu disponibles ?
```

Claude doit lister les 3 outils. Si oui : **prêt pour la démo Arcade**.

---

## 🎬 Préparation finale pour la prise Arcade

Une fois l'installation OK :

- [ ] Fermer toutes les anciennes conversations Claude Desktop (Cmd+W chacune)
- [ ] Ouvrir **une nouvelle conversation vide** (Cmd+N)
- [ ] Vérifier que l'icône MCP est visible en bas du composer
- [ ] Activer **Ne pas déranger** (Centre de notifications macOS)
- [ ] Fermer Slack, Mail, navigateur (tout ce qui pourrait notifier)
- [ ] Positionner la fenêtre Claude Desktop **centrée**, taille raisonnable
- [ ] Lancer Arcade Mac App, **New Arcade → Record App → Claude Desktop**

Tu es maintenant prêt à suivre le script de tournage (`web/script-arcade-tournage.md`).

---

## 🚨 Troubleshooting

**Le double-clic sur le .mcpb n'ouvre rien**
→ macOS demande peut-être confirmation (clic droit → Ouvrir avec → Claude). Ou bien Claude Desktop n'est pas l'app par défaut pour .mcpb : faire un clic droit → Ouvrir avec → Claude une première fois, puis cocher "Toujours ouvrir avec".

**La popup d'install ne s'affiche pas**
→ Claude Desktop peut être en arrière-plan. Cmd+Tab pour le ramener devant.

**Le token est refusé**
→ Vérifier que le token n'a pas expiré côté Pennylane. Tester avec un curl :
```bash
curl -H "Authorization: Bearer <TOKEN>" https://app.pennylane.com/api/external/v2/me
```
Doit renvoyer `200` avec user/company/scopes.

**Les tools n'apparaissent pas dans la liste MCP**
→ Quitter Claude Desktop complètement (Cmd+Q) et le relancer. L'extension est chargée au démarrage uniquement.

**"Pennylane Cabinet" apparaît mais en erreur (statut rouge)**
→ Vérifier les logs Claude : `~/Library/Logs/Claude/mcp-server-Pennylane Cabinet.log` (ou similaire). Erreur de token ou d'API : remettre un token frais.

---

*Procédure HOLCO · Pierre Coquard · 11 mai 2026*
