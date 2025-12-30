# Shift Sorting Hat - Stress Test Report
Generated: 2025-12-29T06:48:49.433Z
Total scenarios: 10
Runs per scenario: 100

## Overall Summary
- **Total runs:** 1000
- **Total successful:** 990
- **Overall success rate:** 99.0%

## Scenario Results

| Scenario | Success Rate | Avg Time (ms) | Max Time (ms) | Avg Min Sat | % Got Top 1 | % Got Top 3 |
|----------|-------------|---------------|---------------|-------------|-------------|-------------|
| baseline | 100.0% | 1003 | 3354 | 1.80 | 96.0% | 99.8% |
| small_easy | 100.0% | 200 | 281 | 2.12 | 98.2% | 100.0% |
| large_scale | 92.0% | 2022 | 6710 | 1.93 | 92.7% | 99.8% |
| tight_capacity | 98.0% | 609 | 3266 | 2.10 | 95.4% | 99.9% |
| sparse_preferences | 100.0% | 1004 | 3303 | 1.80 | 96.0% | 99.8% |
| heavy_preassigned | 100.0% | 721 | 1063 | 1.79 | 96.4% | 99.7% |
| popular_shifts | 100.0% | 551 | 700 | 0.00 | 54.9% | 56.4% |
| avoid_morning | 100.0% | 536 | 657 | 0.00 | 58.1% | 60.7% |
| forbid_backtoback | 100.0% | 720 | 1108 | 1.84 | 95.9% | 99.8% |
| impossible | 100.0% | 545 | 674 | 1.95 | 96.2% | 99.9% |

## Scenario Details

### baseline
*Typical medium camp, balanced capacity*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.2
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 1003ms, max 3354ms
- Avg min satisfaction: 1.80/shift
- Volunteers getting top choice: 96.0%
- Volunteers getting top 3: 99.8%

### small_easy
*Small camp with ample capacity*

- Days: 6, Volunteers: 20
- Event shifts/day: 2, Capacity ratio: 1.5
- Preferences/volunteer: 10
- Pre-assigned %: 5%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 200ms, max 281ms
- Avg min satisfaction: 2.12/shift
- Volunteers getting top choice: 98.2%
- Volunteers getting top 3: 100.0%

### large_scale
*Large camp, many shifts*

- Days: 12, Volunteers: 100
- Event shifts/day: 4, Capacity ratio: 1.2
- Preferences/volunteer: 15
- Pre-assigned %: 15%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 92/100 (92.0%)
- Solve time: avg 2022ms, max 6710ms
- Avg min satisfaction: 1.93/shift
- Volunteers getting top choice: 92.7%
- Volunteers getting top 3: 99.8%

**Failures by type:**
- exception: 8

**Common failure patterns:**
- Unable to solve the problem. HiGHS error RuntimeError: null function or function signature mismatch (3x)
- Unable to read LP model (see http://web.mit.edu/lpsolve/doc/CPLEX-format.htm). HiGHS error RuntimeError: memory access out of bounds (3x)
- Unable to solve the problem. HiGHS error RuntimeError: table index is out of bounds (1x)

### tight_capacity
*Capacity barely meets requirements*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 0.95
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 98/100 (98.0%)
- Solve time: avg 609ms, max 3266ms
- Avg min satisfaction: 2.10/shift
- Volunteers getting top choice: 95.4%
- Volunteers getting top 3: 99.9%

**Failures by type:**
- exception: 1
- infeasible: 1

**Common failure patterns:**
- Unable to solve the problem. HiGHS error RuntimeError: null function or function signature mismatch (1x)
- Unable to fill all shifts (1x)

### sparse_preferences
*Volunteers only rank 5 shifts*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.2
- Preferences/volunteer: 5
- Pre-assigned %: 10%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 1004ms, max 3303ms
- Avg min satisfaction: 1.80/shift
- Volunteers getting top choice: 96.0%
- Volunteers getting top 3: 99.8%

### heavy_preassigned
*Half of volunteers have pre-assigned points*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.2
- Preferences/volunteer: 10
- Pre-assigned %: 50%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 721ms, max 1063ms
- Avg min satisfaction: 1.79/shift
- Volunteers getting top choice: 96.4%
- Volunteers getting top 3: 99.7%

### popular_shifts
*Everyone wants the same 20% of shifts*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.2
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: popular_shifts
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 551ms, max 700ms
- Avg min satisfaction: 0.00/shift
- Volunteers getting top choice: 54.9%
- Volunteers getting top 3: 56.4%

### avoid_morning
*Breakfast shifts are unpopular*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.2
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: avoid_morning
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 536ms, max 657ms
- Avg min satisfaction: 0.00/shift
- Volunteers getting top choice: 58.1%
- Volunteers getting top 3: 60.7%

### forbid_backtoback
*Back-to-back shifts strictly forbidden*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 1.3
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: random
- Forbid back-to-back: true

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 720ms, max 1108ms
- Avg min satisfaction: 1.84/shift
- Volunteers getting top choice: 95.9%
- Volunteers getting top 3: 99.8%

### impossible
*Deliberately unsolvable - tests error handling*

- Days: 9, Volunteers: 50
- Event shifts/day: 3, Capacity ratio: 0.7
- Preferences/volunteer: 10
- Pre-assigned %: 10%
- Preference correlation: random
- Forbid back-to-back: false

**Results:**
- Success: 100/100 (100.0%)
- Solve time: avg 545ms, max 674ms
- Avg min satisfaction: 1.95/shift
- Volunteers getting top choice: 96.2%
- Volunteers getting top 3: 99.9%

## Analysis & Recommendations

### Quality Concerns
- **popular_shifts**: avg min satisfaction 0.00
- **avoid_morning**: avg min satisfaction 0.00

### "Impossible" Scenario Validation
⚠️ Unexpectedly succeeded in 100.0% of cases - may need investigation

### Summary
✅ Solver performs well across most scenarios