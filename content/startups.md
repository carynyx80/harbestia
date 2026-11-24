# Harvestia sample campaigns (v3)

> Both companies, all founders and all team members below are **FICTIONAL**. They exist only to demo Harvestia. Every campaign object carries `sample: true` and the UI shows a "SAMPLE" stamp. Avatars are designed monograms (no photos of real people). Numbers match SPEC.md "Sample campaigns (v3)".
>
> Art: `web/public/startups/*.png`, sources in `content/art/` (render with headless Chrome; monograms via `monogram.html?t=IV&bg=navy&tag=ZTRV`).

---

## 1. Zentrove (id `zentrove`) — crypto · token offering

**Tagline:** Private stablecoin payroll for remote teams.
**Status:** Raising · $286,000 of $750,000 · 41 investors · closes in 21 days · 20% ($150,000) upfront at close.
**Offering:** token ZTRV · 1,000,000,000 supply · 15% to investors · target launch 2027-06-30 · 3-month cliff, 12-month linear vesting.
**Cover:** `/startups/zentrove-cover.png` · **Founder avatar:** `/startups/zentrove-founder.png`

### Story
Imani ran payroll for a 14-person remote team in USDC. It was fast and cheap until a contractor pulled up a block explorer and found every colleague's salary in about four minutes. Zentrove is the payroll tool she wanted that week: teams fund one treasury, Zentrove settles each salary in USDC on Solana with the amounts shielded, and every employee gets a compliant payslip they can show a landlord or a tax office. The chain proves everyone was paid; it no longer says how much.

### Problem
Paying a remote team in stablecoins exposes every salary on a public chain. Anyone with a wallet address can read who earns what, when raises land and when someone leaves — so most teams fall back to slow, expensive wires.

### Solution
Payroll that settles USDC on Solana with amounts shielded, plus compliant payslips. Employers upload a payroll run once; recipients receive funds to their own wallets, and only the employer, the employee and an optional auditor key can see the figures.

### Why now
Stablecoin payroll moved from experiment to habit for crypto-native and cross-border teams, and confidential-transfer tooling on Solana is now mature enough to build on. Teams want the speed of USDC without publishing their compensation bands.

### Team (fictional)
| Name | Role | Avatar | Background |
|---|---|---|---|
| Imani Vale | Founder & CEO | `zentrove-founder.png` (IV) | Ex-payments engineer; built payout and reconciliation systems. |
| Oskar Lindgren | Protocol Engineer | `zentrove-team-ol.png` (OL) | Rust and Solana programs; owns the shielded settlement path. |
| Priya Natarajan | Head of Compliance | `zentrove-team-pn.png` (PN) | Former payroll-compliance lead; owns payslips, tax exports and auditor keys. |

### Use of funds (sums to 100%)
| Item | % |
|---|---|
| Protocol & payroll engineering | 40 |
| Security audits | 20 |
| Compliance & payslip licensing | 15 |
| Design-partner onboarding | 15 |
| Legal & ops | 10 |

### Milestones
| # | Title | Month | Release | Evidence the founder will provide |
|---|---|---|---|---|
| M1 | Private payroll live on mainnet beta | 3 | $200,000 | Public program address, third-party audit report, explorer link to a real run showing transfers without amounts. |
| M2 | 100 teams running payroll | 6 | $200,000 | On-chain count of employer treasuries with settled runs, plus a signed customer list shared with voters. |
| M3 | ZTRV launch + $1M monthly payroll volume | 9 | $200,000 | ZTRV mint address, vesting contract, and an aggregate monthly volume attestation from the settlement program. |

### Risks (honest)
- Regulation of privacy features on public chains is unsettled; a jurisdiction could restrict shielded transfers, forcing a transparent fallback mode.
- We depend on Solana confidential-transfer tooling and USDC; a protocol bug or issuer change would pause payroll runs.
- ZTRV has no guaranteed value or listing. The token launch is a milestone, not a promise of liquidity.
- Payroll is a trust product: one late run can lose a customer. The team is small and key-person risk is real.

### Founder updates
- **2026-11-21 — Testnet payroll #12 settled.** Ran a 38-recipient payroll on devnet in under 40 seconds. Explorer shows transfers, not amounts. Auditor-key export works.
- **2026-11-14 — Design partners signed.** Nine remote teams (6–60 people) signed letters of intent to run their first mainnet-beta payroll with us.
- **2026-11-06 — Raise opened.** We are raising $750k. 20% unlocks at close; the rest only if investors approve each milestone.

---

## 2. Ferrolab (id `ferrolab`) — tech (hardware + software, category `saas`) · equity offering

**Tagline:** AI inspection cameras for small factories.
**Status:** Active · raise closed 130 days ago · fully raised $500,000 · 63 investors · 20% ($100,000) upfront.
**Offering:** equity 12% · investors receive 7% of monthly revenue, paid monthly, first payout after 90 days.
**Payout ledger:** 1 period paid ON_TIME — revenue $31,400 → $2,198 to investors.
**Cover:** `/startups/ferrolab-cover.png` · **Founder avatar:** `/startups/ferrolab-founder.png`

### Story
Tomas spent nine years on factory floors where the quality check was a tired person with a flashlight at the end of a shift. Big plants buy six-figure vision systems; the 40-person machine shop next door cannot. Ferrolab is a camera that clamps over an existing conveyor, learns what a good part looks like from a few hundred examples, and flags the bad ones before they ship. It costs a monthly subscription, not a capital budget, and the first install takes an afternoon.

### Problem
Small factories catch defects by eye, losing 3–5% of output to scrap and returns. Industrial vision systems exist, but they cost six figures and need an integrator.

### Solution
A plug-in camera + model that flags defects on the line, sold as a monthly subscription. Each unit trains on the customer's own parts, runs on-device, and sends a shift report the plant manager can actually read.

### Why now
Edge hardware that can run a vision model at line speed now costs less than a monthly scrap bill, and labour shortages mean small plants can no longer staff a full-time inspector per line.

### Team (fictional)
| Name | Role | Avatar | Background |
|---|---|---|---|
| Tomas Rieger | Founder & CEO | `ferrolab-founder.png` (TR) | Former manufacturing-line engineer; sells to and installs at every pilot. |
| Lena Okoro | ML Lead | `ferrolab-team-lo.png` (LO) | Computer-vision engineer; owns few-shot training and on-device inference. |
| Marek Novak | Hardware & Field Ops | `ferrolab-team-mn.png` (MN) | Ex-automation technician; designs the mount and runs installs. |

### Use of funds (sums to 100%)
| Item | % |
|---|---|
| Camera hardware | 35 |
| ML engineering | 25 |
| Factory pilot installs | 20 |
| Sales & travel | 12 |
| Legal & ops | 8 |

### Milestones
| # | Title | Month | Release | Status | Evidence the founder will provide |
|---|---|---|---|---|---|
| M1 | 50 cameras installed at paying factories | 3 | $150,000 | Released | Device registry export with serials and heartbeat logs, invoices per factory, install photos (no faces). |
| M2 | $40k monthly recurring revenue | 6 | $150,000 | Voting now | Billing-system export, matching bank statement, customer list shared privately with voters. |
| M3 | 3 enterprise contracts signed | 9 | $100,000 | Pending | Redacted signed contracts and a confirmation letter from each customer. |

### Public spending ledger
| When | Category | Description | USDC |
|---|---|---|---|
| −120 d | Hardware | Camera hardware batch — 60 units | 54,000 |
| −104 d | Engineering | ML engineer contract — defect model v2 | 36,000 |
| −80 d | Installs | Factory pilot installs — 19 sites | 28,500 |
| −35 d | Sales | Sales travel — trade fair + site visits | 9,200 |

### Risks (honest)
- Hardware margins are thin and component prices move; a supply shock would slow installs.
- Each new part type needs fresh training data; accuracy on unusual parts may lag pilot numbers.
- Revenue payouts depend on subscription revenue, which can churn if a factory closes a line.
- Enterprise contracts (M3) have long sales cycles and may slip past month 9.

### Founder updates
- **2026-11-20 — M2 evidence submitted.** MRR hit $41.2k in the last full month. Billing export, bank statement and customer list are attached to the vote.
- **2026-11-02 — First payout deposited.** Paid $2,198 to investors on $31,400 of revenue — on time. 7% of monthly revenue, as promised.
- **2026-10-10 — M1 released.** Investors approved milestone 1: 52 cameras running at 19 paying factories. $150k released.
