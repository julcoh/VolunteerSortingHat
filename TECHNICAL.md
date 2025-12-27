# TECHNICAL.md - Shift Sorting Hat

> **Note:** This document is for developers. The project owner (Julien) should not need to read this.

## Architecture Overview

### Tech Stack Decisions

**Frontend Framework: React + TypeScript**
- Reasoning: Wide ecosystem, good tooling, TypeScript catches errors early
- Alternative considered: Vue, Svelte - React chosen for broader support and hiring pool

**Build Tool: Vite**
- Fast development server, good defaults, simple configuration

**Styling: Tailwind CSS**
- Utility-first, fast to iterate, no context-switching to CSS files

**Optimization Solver: HiGHS via highs-js (WebAssembly)**
- The original uses Google OR-Tools CP-SAT (Python)
- OR-Tools doesn't have a browser-compatible build
- HiGHS is a high-performance LP/MIP solver with WASM support
- Will need to reformulate the constraint satisfaction problem as a mixed-integer program
- Alternative: Implement a custom solver in JS (rejected - reinventing the wheel)

**File Parsing: Papa Parse (CSV), SheetJS (Excel)**
- Both are battle-tested libraries for browser-based file parsing

**State Management: Zustand**
- Lightweight, simple API, good TypeScript support
- No need for Redux complexity for this app size

### Data Model

```typescript
interface Shift {
  id: string;
  date: Date;
  role: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  points: number;
}

interface Volunteer {
  name: string;
  minPoints?: number;  // Override global minimum
  preferences: Map<string, number>;  // shiftId -> rank (1-5)
}

interface Settings {
  minPoints: number;
  maxOver: number;
  seed?: number;
}

interface Assignment {
  volunteerId: string;
  shiftId: string;
}
```

### Optimization Reformulation

The original CP-SAT model needs to be reformulated as a Mixed-Integer Linear Program (MILP):

**Decision Variables:**
- `x[v,s]` ∈ {0,1}: volunteer v assigned to shift s

**Objective (Maximize):**
- Sum of preference scores for all assignments
- Minus penalties for sequential shifts

**Constraints:**
1. Shift capacity: `sum(x[v,s] for all v) <= capacity[s]`
2. No overlapping shifts: `x[v,s1] + x[v,s2] <= 1` for overlapping s1, s2
3. Min points: `sum(x[v,s] * points[s] for all s) >= minPoints[v]`
4. Max points: `sum(x[v,s] * points[s] for all s) <= maxPoints[v]`
5. At least one preferred shift: `sum(x[v,s] for s in top5[v]) >= 1`

**Two-Phase Approach:**
- Phase 1: Soft capacity constraints, only top-5 preferences
- Phase 2: Hard capacity constraints, all shifts available

### File Structure

```
/
├── CLAUDE.md           # Project context for AI assistant
├── TECHNICAL.md        # This file
├── PreviousData/       # Original Colab implementation (reference)
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/
│   │   ├── solver/     # Optimization logic
│   │   ├── parser/     # File parsing utilities
│   │   └── utils/      # General utilities
│   ├── store/          # Zustand state management
│   └── types/          # TypeScript type definitions
├── tests/              # Test files
└── public/             # Static assets
```

### Testing Strategy

- **Unit tests:** Solver logic, parsing functions, utility functions
- **Integration tests:** Full solve with known inputs/outputs
- **E2E tests (Playwright):** Upload flow, solve flow, download flow
- **Validation:** Compare results against original Python implementation using same inputs

### Known Technical Challenges

1. **Solver performance in browser:** May need to show progress indicator for large instances
2. **Excel date parsing:** Excel stores dates as numbers; need careful conversion
3. **Memory for large instances:** May need to limit problem size or show warnings

### Deployment

- Static site hosting (Vercel, Netlify, or GitHub Pages)
- No backend required
- All computation client-side

### Version History

| Date | Version | Notes |
|------|---------|-------|
| TBD  | 0.1.0   | MVP - basic upload, solve, download |
