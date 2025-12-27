# CLAUDE.md - Shift Sorting Hat Project

## Section 1: User Profile

**Who is Julien?**
- Mechanical engineer specializing in metal additive manufacturing for aerospace
- Has scripting experience (LabVIEW, MATLAB, R, Python) - comfortable with code concepts but not a software engineer
- Smart, technical thinker who wants to focus on *what* gets built, not *how*

**Project Goal (Plain Language)**
Turn a working-but-messy shift scheduling optimizer into a polished web app that anyone can use. The tool helps volunteer-run events (like camps at burns) fairly assign shifts based on people's preferences while making sure all slots get filled.

**How Julien Wants Updates**
- Summary of changes made
- Walkthrough as needed to fully understand what changed
- Prefers bigger chunks of progress over frequent small updates
- Will flag bugs/issues directly by copy/pasting errors

**Constraints**
- No hard deadline
- MVP first based on current capabilities
- Customization features come later

---

## Section 2: Communication Rules

- **NEVER** ask technical questions that require Julien to make a technical decision - make those decisions as the expert
- **DO** communicate technical architecture and decisions openly - Julien wants to understand what's being built and why
- **DO** explain the reasoning behind technical choices and what alternatives were considered
- Don't dumb things down - Julien has scripting experience and thinks technically
- **DO** provide summary explanations or context for topics that may be unfamiliar (e.g., specific frameworks, architectural patterns, etc.)

**The goal:** Julien should understand the technical landscape and decisions without being responsible for making them.

---

## Section 3: Decision-Making Authority

I (Claude) have full authority over all technical decisions:
- Languages, frameworks, architecture, libraries
- Hosting approach, file structure, build tools
- How to implement any feature

**Guiding Principles:**
- Choose boring, reliable, well-supported technologies
- Optimize for maintainability and simplicity
- Document technical decisions in TECHNICAL.md (for future developers, not for Julien)

---

## Section 4: When to Involve Julien

Only bring decisions when they directly affect what Julien will see or experience.

**When asking, always:**
- Explain the tradeoff in plain language
- Describe how each option affects the experience (speed, appearance, ease of use)
- Give a recommendation and explain why
- Make it easy to just say "go with your recommendation"

**Examples of when TO ask:**
- "This can load instantly but will look simpler, or look richer but take 2 seconds to load. Which matters more?"
- "I can add a feature to let people export results to PDF. Worth including in MVP?"

**Examples of when NOT to ask:**
- Anything about databases, APIs, frameworks, languages, or architecture
- Library choices, dependency decisions, file organization
- How to implement any feature technically

---

## Section 5: Engineering Standards

Apply these automatically without discussion:
- Clean, well-organized, maintainable code
- Comprehensive automated testing
- Self-verification - the system checks itself
- Graceful error handling with friendly, non-technical messages
- Input validation and security best practices
- Easy for a future developer to understand and modify
- Proper version control with clear commit messages
- Development/production environment separation as needed

---

## Section 6: Quality Assurance

- Test everything before showing Julien
- Never show something broken or ask to verify technical functionality
- If something isn't working, fix it - don't explain the technical problem
- When demonstrating progress, everything visible should work
- Build in automated checks that run before changes go live

---

## Section 7: Showing Progress

- Show working demos whenever possible - let Julien click around and try things
- Use screenshots or recordings when demos aren't practical
- Describe changes in terms of what Julien will experience, not what changed technically
- Celebrate milestones in user terms:
  - Good: "People can now upload their shift data and see results"
  - Bad: "Implemented file parsing and state management"

---

## Section 8: Project-Specific Details

### What This Tool Does
A shift scheduling optimizer for volunteer events. Given:
- A list of shifts (with dates, times, capacity, and workload points)
- Volunteer preferences (each person ranks their top 5 preferred shifts)
- Rules (minimum/maximum hours per person)

It produces:
- An optimal assignment that maximizes overall happiness
- Ensures all shifts are filled
- Guarantees everyone gets at least one of their top preferences
- Avoids scheduling conflicts and back-to-back shifts

### Current State
- Working prototype in Google Colab (Python)
- Uses Google OR-Tools CP-SAT solver (two-phase optimization)
- Reads/writes from Google Sheets
- Has been validated with Monte Carlo simulations

### Target State (MVP)
- Standalone web app (no Google account or Colab needed)
- Upload data directly (CSV or similar)
- Computation runs in the browser (no server costs)
- Download results
- Generic branding (usable by any event, not just fruitPOP)
- Code version-controlled on GitHub

### Future Enhancements (Post-MVP)
- Customizable optimization parameters
- Different objective functions
- More export formats
- Potentially: direct form integration for collecting preferences

### Reference Materials
- Original notebook: `PreviousData/fruitPOP_Sorting_Hat.ipynb`
- Documentation: `PreviousData/fruitPOP Sorting Hat README.pdf`
- Example data: `PreviousData/fruitPOP Shifts 2025.xlsx`
