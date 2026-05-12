# PennyPilot

**The AI copilot for French accounting firms (cabinets d'expertise comptable) on Pennylane.**

PennyPilot is an MCP (Model Context Protocol) extension that connects Claude Desktop to your Pennylane dossiers, directly inside the conversation. It produces a complete monthly closing memo for a client dossier in 8 seconds instead of 1h30, and covers the full general ledger (journals, chart of accounts, per-account ledger view, pending lettering, audit trail) — all read-only, all local, all in plain French for the cabinet collaborator.

Edited by **HOLCO**, Paris, France · v0.2.6 (restricted beta) · pilot active

- **Product page**: https://apps.holco.co/mcp/pennylane
- **Pilot enrollment**: https://apps.holco.co/mcp/pennylane/cgu
- **Security & GDPR**: https://apps.holco.co/mcp/pennylane/docs/security
- **MCP Registry**: https://registry.modelcontextprotocol.io/?search=pennypilot (`io.github.holco-apps/pennypilot`)
- **Contact**: alan@holco.co

---

## ⚠️ What Claude Desktop will display at install

When you double-click the `.mcpb` bundle, Claude Desktop will show this Anthropic warning:

> *"The developer information shown has not been verified by Anthropic."*

**This is normal.** All third-party extensions not yet listed in Anthropic's official directory display this message, regardless of their quality. PennyPilot was submitted to the official Anthropic Connectors Directory — review is in progress (Q3 2026 target).

**Verifiable trust signals:**

| | |
|---|---|
| Source code (this repo) | [github.com/holco-apps/pennypilot](https://github.com/holco-apps/pennypilot) (public) |
| Editor | **HOLCO**, registered in Paris (France) |
| Direct contact | alan@holco.co |
| Security documentation | [apps.holco.co/mcp/pennylane/docs/security](https://apps.holco.co/mcp/pennylane/docs/security) |
| Pilot Terms of Use | [apps.holco.co/mcp/pennylane/cgu](https://apps.holco.co/mcp/pennylane/cgu) |
| MCP Server Registry listing | [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/?search=pennypilot) (status active) |

---

## Install (end-user firm)

1. **Sign up to the pilot** at https://apps.holco.co/mcp/pennylane/cgu (mandatory reading of Terms of Use before the form).
2. **HOLCO validates manually** — each request is reviewed by hand within 24 hours (pilot is capped at 5 firms during the beta).
3. **You receive an email** from `alan@holco.co` with your HOLCO license key + the link to download the bundle.
4. **Drag-drop** the `pennypilot-0.2.6.mcpb` file into Claude Desktop, enter your HOLCO key + your Pennylane Company API v2 token → 30-second install.

Detailed procedure: [`docs/install.md`](docs/install.md)

---

## Thirteen tools

| Tool | Role |
|---|---|
| `about_pennypilot` | Welcome card listing tools and usage hints — triggered when the user starts a conversation |
| `find_unpaid_customer_invoices` | Overdue customer invoices, top 3 debtors, 60-day alert |
| `get_company_pnl` | Synthetic P&L for a month / quarter / year, comparison vs prior period, anomalies flagged |
| `generate_monthly_close_report` | Complete monthly closing memo (KPIs, P&L commentary, AR aging, anomalous spend, vendor duplicates, prioritized cabinet actions) — 4 tones |
| `list_journals` | Accounting journals configured on the dossier (sales / purchases / bank / general / cash) |
| `get_chart_of_accounts` | Chart of accounts grouped by French PCG class (1–8), filterable by prefix |
| `browse_account_ledger` | General ledger view of a single account over a period, with running balance |
| `find_unlettered_entries` | Pending lettering on customer (411\*) / supplier (401\*) accounts, ranked by amount + age |
| `browse_journal_entries` | Ledger entries over a period, optionally filtered by journal code |
| `get_journal_entry_detail` | Full detail of a single entry: header, all debit/credit lines, balance check, lettering state |
| `audit_recent_changes` | Audit trail of recent modifications (compliance) |
| `list_fiscal_years` | Fiscal years configured on the company (open / closing / closed) |
| `send_feedback_to_holco` | Feedback channel triggered by typing `@holco` in the conversation — sends bug / idea / comment / question to HOLCO |

Read-only access in v0.2.x. Write operations (lettering, invoicing) planned for v0.4 (Q4 2026) with a mandatory preview → commit pattern (zero modification without explicit user validation).

---

## Context-guarded analysis (v0.2.6)

The two heaviest analysis tools (`get_company_pnl`, `generate_monthly_close_report`) refuse to run without first establishing the dossier context. They auto-detect SIREN + NAF activity code via Pennylane `/me` + the official French open-data API `recherche-entreprises.api.gouv.fr` (Etalab), then ask the user a single confirmation question about seasonality and accounting particulars before producing any analysis. This avoids false-anomaly reports (e.g. revenue=0 on a seasonal retail dossier where July is naturally low).

---

## Architecture

- **Runtime**: Node.js ≥ 20, stdio transport (Claude Desktop) or Streamable HTTP (Mistral Le Chat, ChatGPT Business — coming v0.3)
- **Distribution**: `.mcpb` bundle (Anthropic format), downloaded from `apps.holco.co` after pilot enrollment, or directly from this repo's GitHub Releases
- **Pennylane token**: stored as a Claude Desktop environment variable on the user's workstation, **never transmitted to HOLCO**
- **HOLCO license key**: only the SHA-256 hash is consulted, against the public registry at [apps.holco.co/api/licenses.json](https://apps.holco.co/api/licenses.json)
- **No accounting data** transits HOLCO infrastructure — the extension talks directly from the user's workstation to the Pennylane v2 API

### Engineering

- **Three-layer architecture**: `server.js` (MCP routing) → `lib/tools/*.js` (schemas + handlers) → `lib/pennylane-client.js` (HTTP, retry, pagination)
- **Cursor pagination factored** in a single `paginate()` async generator with explicit `maxPages` cap (no silent truncation)
- **Structured JSON logging** via `lib/logger.js` (stderr, levels `debug|info|warn|error`, configurable via `PENNYPILOT_LOG_LEVEL`)
- **Single `VERSION` source** read from `manifest.json` at boot, propagated to User-Agent and feedback payloads
- **Tests**: `node:test` (zero-dependency) on period parsing, NAF mapping, error humanization, pagination. Run with `npm test`.
- **CI**: GitHub Actions runs tests on Node 20 + 22, checks version consistency between `manifest.json` and `package.json`, builds the `.mcpb` bundle as a release artifact

---

## Security

See https://apps.holco.co/mcp/pennylane/docs/security for full details. Key points:

- ✓ No accounting data on HOLCO side
- ✓ Pennylane token stays local (Claude Desktop env var)
- ✓ Strict read-only enforcement in v0.2.x
- ✓ No AI training on accounting data (contractual opt-out with Anthropic)
- ✓ GDPR compliant — controller is the firm; HOLCO provides software only
- ✓ Compatible with EU AI Act (UE 2024/1689)

---

## Roadmap

- **Today**: v0.2.6 — 13 tools, listed on the MCP Registry, pilot ongoing (5 firms)
- **Q3 2026**: Streamable HTTP adapters (Mistral Le Chat, ChatGPT Business / Enterprise)
- **Q4 2026**: Write tools (lettering, invoice creation) with mandatory `preview → commit` pattern
- **Q1 2027**: Multi-dossier mode (Firm API Token instead of Company Token)
- **Q3 2026 target**: Anthropic Connectors Directory verification (submission made)

---

## License

Proprietary — see [`LICENSE`](LICENSE). Reverse engineering, redistribution, and commercial exploitation are forbidden without HOLCO's prior written consent.

---

## Contact

- **Product questions, install, support**: alan@holco.co
- **Commercial / partnerships**: alan@holco.co
- **Technical issues**: open a GitHub Issue on this repo

HOLCO · Paris, France · https://holco.co

