# Shift Sorting Hat

A fair shift scheduling optimizer for volunteer-run events. Upload your shifts and volunteer preferences, and the tool assigns everyone fairly while filling all slots.

## What It Does

Given:
- A list of shifts (dates, times, capacity, workload points)
- Volunteer preferences (each person ranks their top 5 preferred shifts)
- Fairness constraints (min/max points per person)

It produces:
- Optimal assignments that maximize overall satisfaction
- Guaranteed preference fulfillment (everyone gets at least one of their top choices)
- Fair workload distribution (everyone works similar amounts)
- No scheduling conflicts or unwanted back-to-back shifts

## How It Works

The tool uses a two-phase MILP (Mixed Integer Linear Programming) optimization:

1. **Phase 1 (Egalitarian)**: Maximizes the *minimum* satisfaction across all volunteers using binary search. This ensures the least-happy person is as happy as possible.

2. **Phase 2 (Hard Fill)**: If Phase 1 leaves some shifts understaffed, this phase fills remaining slots while respecting constraints.

The solver runs entirely in your browser using [HiGHS](https://highs.dev/) compiled to WebAssembly - no server required, your data stays local.

## Running Locally

```bash
# Clone the repo
git clone https://github.com/your-username/ShiftSortingHat.git
cd ShiftSortingHat/app

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:5173 in your browser.

## Input Format

Upload an Excel file (.xlsx) with two sheets:

**Shifts sheet:**
| ShiftID | Date | Role | StartTime | EndTime | Capacity | Points |
|---------|------|------|-----------|---------|----------|--------|
| 1 | 2025-08-25 | Gate | 10:00 AM | 2:00 PM | 2 | 2 |

**Prefs sheet:**
| Volunteer | PreAssignedPoints | 1 | 2 | 3 | ... |
|-----------|-------------------|---|---|---|-----|
| Alice | 0 | 1 | 3 | 2 | ... |

Column headers after `PreAssignedPoints` are ShiftIDs. Values are preference ranks (1 = first choice, 5 = fifth choice). Empty cells mean no preference.

## Key Settings

- **Min/Max Points**: Workload bounds per volunteer (auto-detected from your data)
- **Preference Guarantee**: Everyone gets at least one shift from their top N choices
- **Back-to-Back Shifts**: Minimize or forbid consecutive shifts
- **Allow Relaxation**: If disabled, solver fails rather than assign unfair workloads

## License

MIT
