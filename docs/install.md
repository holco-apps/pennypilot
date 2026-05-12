# Install PennyPilot v0.2.4

Step-by-step guide for installing the PennyPilot extension inside Claude Desktop.

> The end-user French documentation lives at https://apps.holco.co/mcp/pennylane/docs/install — this README mirrors the developer-facing English version.

---

## Prerequisites

- **Claude Desktop** macOS or Windows (versions 2025+) — download: https://claude.ai/download
- **A HOLCO license key** (format `HOLCO-XXXX-XXXX-XXXX-XXXX`) received by email from `alan@holco.co` after pilot enrollment at https://apps.holco.co/mcp/pennylane/cgu
- **A Pennylane Company API v2 token** generated on the test dossier: Pennylane → Settings → Connectivity → Developers → API v2

---

## Three install steps

### 1. Download the bundle

From your personal access page (link in the welcome email), or directly:

- From the production CDN: https://apps.holco.co/downloads/pennypilot-0.2.4.mcpb
- From this GitHub Release: https://github.com/holco-apps/pennypilot/releases/download/v0.2.4/pennypilot-0.2.4.mcpb

Bundle SHA-256: `b7c0f331d281ad514616f7472f21f12118f4315af8acbf271f596bf4932fea39`

### 2. Drag-drop into Claude Desktop

- Drag the `pennypilot-0.2.4.mcpb` file onto the Claude Desktop window, OR
- Settings → MCP Extensions → Install Extension → select the file

#### ⚠️ Anthropic warning at install

Claude Desktop will display:

> *"The developer information shown has not been verified by Anthropic."*

**This is normal.** All third-party extensions not listed in Anthropic's official directory show this message, regardless of their quality.

**Verifiable trust signals:**

- Source code: https://github.com/holco-apps/pennypilot (public, you are here)
- Editor: HOLCO, registered in Paris (France)
- Direct contact: alan@holco.co
- Security documentation: https://apps.holco.co/mcp/pennylane/docs/security
- MCP Server Registry: https://registry.modelcontextprotocol.io/?search=pennypilot

PennyPilot was submitted to the official Anthropic Connectors Directory — review in progress (Q3 2026).

### 3. Enter your keys

Claude opens a popup requesting two values:

- **HOLCO_LICENSE_KEY**: your pilot key (format `HOLCO-XXXX-XXXX-XXXX-XXXX`)
- **PENNYLANE_TOKEN**: your Company API v2 token from Pennylane

Both values are stored as **Claude Desktop environment variables** on your workstation, never sent to HOLCO. The HOLCO key is only consulted locally as a SHA-256 hash against the public registry at https://apps.holco.co/api/licenses.json.

---

## First message

Open a **new conversation** in Claude Desktop and start with:

```
PennyPilot, what can you do?
```

(works in French too: *« PennyPilot, que peux-tu faire ? »*)

PennyPilot introduces itself, lists its 13 tools, and suggests questions to ask about your dossier. This is the best entry point.

Then try real questions like:

- *"Generate the monthly close memo for May 2026"* / *"Génère la note de synthèse de mai 2026 pour mon dossier"*
- *"Which customer invoices are over 60 days overdue?"* / *"Quelles factures clients sont en retard de plus de 60 jours ?"*
- *"Show me Q1 P&L"* / *"Donne-moi le P&L du dernier trimestre"*

First response in 6–10 seconds (the full monthly close memo takes ~8 s on a medium-sized dossier).

---

## Verify the install

If you're not sure it's working, ask Claude:

> *"PennyPilot, what tools do you have?"*

The `about_pennypilot` tool returns a welcome card listing 13 tools. If nothing shows up: **Claude Desktop → Settings → MCP Extensions** — check that PennyPilot is listed and **Enabled**.

---

## Uninstall

Settings → MCP Extensions → PennyPilot → Remove.

The MCP server stops, your Pennylane token is purged from Claude Desktop's environment variables. Past conversations remain visible but the tool can no longer query Pennylane.

---

## Support

- Product question, support, bug: alan@holco.co
- GitHub Issues: https://github.com/holco-apps/pennypilot/issues
- Full French documentation: https://apps.holco.co/mcp/pennylane/docs/install
