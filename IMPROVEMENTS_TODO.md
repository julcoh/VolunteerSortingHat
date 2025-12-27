# Shift Sorting Hat - Improvement Roadmap

## Overview

This document tracks potential improvements analyzed from three user perspectives:
1. **Admin** - Event organizer focused on fairness and equity
2. **Shift Lead** - Operator using the tool and communicating results
3. **Volunteer** - End user inputting preferences and receiving assignments

---

## 1. Admin Perspective (Fairness & Equity Focus)

- [ ] **Equity metrics dashboard** - Show distribution of preference satisfaction across volunteers (histogram of #1, #2, etc. hits)
  - *Benefit: Demonstrate fairness; identify if certain people consistently get worse assignments*

- [ ] **Year-over-year tracking** - Import previous years' data to factor in historical assignment quality
  - *Benefit: Volunteers who got unlucky last year can be prioritized this year*

- [ ] **Configurable objective weights** - Let admin tune prioritization of #1 vs #2 preferences, or equity vs overall satisfaction
  - *Benefit: Different events may value different tradeoffs*

- [ ] **Protected groups/accommodations** - Flag volunteers with accessibility needs, childcare constraints, or role restrictions
  - *Benefit: Ensure ADA compliance and handle real-world constraints*

- [ ] **Conflict-of-interest handling** - Prevent specific volunteer pairs from being assigned together (or require them together)
  - *Benefit: Handle interpersonal dynamics, supervision requirements, buddy systems*

- [ ] **Transparency report** - Generate document explaining algorithm, constraints, and assignment rationale
  - *Benefit: Preempt complaints; demonstrate fair process*

- [ ] **Multiple solution comparison** - Run solver with different seeds and compare outcomes
  - *Benefit: Demonstrate results are stable, not just one lucky/unlucky configuration*

---

## 2. Shift Lead Perspective (Operational Focus)

- [ ] **Input validation with clear errors** - Validate shift IDs match, flag volunteers with no valid preferences before solving
  - *Benefit: Catch data entry errors before wasting time on failed solves*

- [ ] **"What-if" scenarios** - Save current solution, tweak assignments manually, see impact
  - *Benefit: Handle last-minute changes ("Alex dropped out, who can cover?")*

- [ ] **Manual override capability** - Lock certain assignments before solving, or manually swap after
  - *Benefit: Real-world always has exceptions; support them gracefully*

- [ ] **Email/notification templates** - Generate personalized messages for each volunteer with their assignments
  - *Benefit: Reduce communication burden; ensure consistent messaging*

- [ ] **Shift roster printouts** - One-page-per-shift view with assigned volunteers, contact info, timing
  - *Benefit: Useful for day-of operations*

- [ ] **Undo/history** - Track changes and allow rollback
  - *Benefit: Don't lose work when mistakes happen*

- [ ] **Progress indicator during solve** - Show meaningful progress (Phase 1/2, % complete)
  - *Benefit: Long solves less stressful when progress is visible*

- [ ] **Infeasibility diagnosis** - When no solution exists, explain WHY (which constraints conflict)
  - *Benefit: Currently just says "infeasible" - make it actionable*

- [ ] **Partial preference support** - Handle volunteers who only ranked 2-3 shifts instead of 5
  - *Benefit: Real data is messy; handle gracefully*

- [ ] **Save/load projects** - Save parsed data + results to reload later
  - *Benefit: Don't re-upload and re-solve for minor changes*

---

## 3. Volunteer Perspective (Experience & Understanding Focus)

- [ ] **Personal assignment explanation** - "You got Shift 24 (your #1) and Shift 13 (your #2), totaling 6.5 points"
  - *Benefit: Volunteers understand what they got and that preferences were respected*

- [ ] **Preference collection form** - Built-in form instead of requiring Excel data entry
  - *Benefit: Reduces friction and data entry errors*

- [ ] **Preference confirmation** - Show volunteers what the system received before solving
  - *Benefit: Catch mistakes before they affect assignments*

- [ ] **Assignment notification with context** - Email showing shifts, times, locations, plus preference satisfaction
  - *Benefit: Proactive communication reduces questions*

- [ ] **Appeal/feedback mechanism** - Way to flag issues with assignments
  - *Benefit: Volunteers feel heard even if nothing changes*

- [ ] **Calendar export (ICS)** - One-click add shifts to personal calendar
  - *Benefit: Practical convenience; reduces no-shows*

- [ ] **Shift details visibility** - Show role descriptions, locations, what to bring
  - *Benefit: Volunteers know what they're signing up for*

- [ ] **Preference guidance** - Help text explaining ranking system with tips
  - *Benefit: Better input quality leads to better matches*

---

## 4. Cross-Cutting Improvements

- [ ] **Mobile-friendly UI** - Responsive design for phone/tablet
  - *Benefit: Shift leads often work from phones on-site*

- [ ] **Dark mode**
  - *Benefit: Accessibility and user preference*

- [ ] **Offline capability** - PWA that works without internet
  - *Benefit: Events often have poor connectivity*

- [ ] **Multi-event support** - Handle multiple events/camps in one instance
  - *Benefit: Organizations often run several events*

- [ ] **Role-based access** - Admin vs Shift Lead vs Volunteer views
  - *Benefit: Different people need different capabilities*

- [ ] **Audit logging** - Track who changed what and when
  - *Benefit: Accountability and debugging*

---

## Prioritization

### High Impact, Lower Effort
- [ ] Input validation with clear errors
- [ ] Infeasibility diagnosis
- [ ] Email/notification templates
- [ ] Personal assignment explanation in results

### High Impact, Higher Effort
- [ ] Preference collection form (replaces Excel input)
- [ ] Manual override capability
- [ ] Year-over-year tracking

---

## Completed


*Items will be moved here as they are implemented*
