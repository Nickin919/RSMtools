# Quote filing and grouping

**Database:** If you added this feature to an existing app, run `npx prisma migrate deploy` (or `migrate dev`) so the new quote grouping columns exist on `price_contracts`.

---

RSMTools lets you find and organize pricing contracts in **two ways**: by **contract name** and by **Quote #**. Quote numbers are parsed so that related revisions (e.g. T26Q5889, T26Q5889-A, T26Q5889-B) are grouped into a single “quote family” for filing and discovery.

---

## Two ways to find quotes

### 1. By contract name

- **Use when:** You remember the contract or PDF name (e.g. “Acme Corp 2026”, “WAGO Quote Jan 2026”).
- **How:** On the Contracts page, leave the view on **“By contract name”**. Contracts are listed by creation date; search or scroll by name.

### 2. By Quote #

- **Use when:** You have a quote number (e.g. T26Q5889, W26Q5889-A) or want to see all revisions of the same quote together.
- **How:** Switch the view to **“By Quote #”**. Contracts are grouped by **quote family** (same core number, e.g. Q5889). Each group shows all versions (base and -A, -B, etc.) so you can file and compare them in one place.

Contracts that have no quote number (or one that doesn’t match the pattern) appear in an **“No quote number”** section at the bottom.

---

## Quote number format

WAGO-style quote numbers follow this pattern:

| Part        | Meaning              | Example   |
|------------|----------------------|-----------|
| **Prefix** | Label / type         | `T` or `W` |
| **Year**   | 2-digit year        | `26` → 2026 |
| **Core**   | Stable quote ID     | `Q5889`   |
| **Revision** | In-year revision | `-A`, `-B`, or none (base) |

**Examples:**

- `T26Q5889`   → 2026 quote, core Q5889, base (no revision)
- `T26Q5889-A` → Same quote, revision A
- `T26Q5889-B` → Same quote, revision B
- `W26Q5889`   → Same core Q5889 with different prefix (e.g. different year label)

The **core** (e.g. `Q5889`) is what groups quotes into one “family.” All of the above would appear in the same **By Quote #** group: **Q5889 (2026)**.

---

## How grouping works

- When you **upload a PDF**, the app reads the quote number from the PDF (if present) and parses it into core, year, prefix, and revision. The contract is then included in the correct quote family when you view **By Quote #**.
- When you **create a contract manually**, you can optionally enter a **Quote #**. The same parsing applies.
- You can **edit** a contract (e.g. rename or set/change Quote #) from the contract detail page (PATCH supports `quoteNumber`); the stored core/year/revision fields are updated so grouping stays correct.

---

## Filing similar quotes together

- **In the app:** Use **“By Quote #”** to see all contracts that share the same core quote number in one group. Open any contract in the group to view or export.
- **Exports:** Each contract has its own **CSV ↓** download. To “file” a quote family, use **By Quote #**, then download CSV for each revision (e.g. T26Q5889, T26Q5889-A) as needed. You can store them in a folder named after the core, e.g. `Q5889/T26Q5889.csv`, `Q5889/T26Q5889-A.csv`.

This gives you a clear **file system**: one logical group per quote family in the UI, and the option to mirror that structure in your own folders when exporting.
