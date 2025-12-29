# Shift Sorting Hat - Improvement Roadmap

## Overview

This document tracks potential improvements analyzed from three user perspectives:
1. **Admin** - Event organizer focused on fairness and equity
2. **Shift Lead** - Operator using the tool and communicating results
3. **Volunteer** - End user inputting preferences and receiving assignments

---

## 1. Admin Perspective (Fairness & Equity Focus)

- [ ] **#001 - Equity metrics dashboard** - Show distribution of preference satisfaction across volunteers (histogram of #1, #2, etc. hits)
  - *Benefit: Demonstrate fairness; identify if certain people consistently get worse assignments*

- [ ] **#002 - Year-over-year tracking** - Import previous years' data to factor in historical assignment quality
  - *Benefit: Volunteers who got unlucky last year can be prioritized this year*

- [ ] **#003 - Configurable objective weights** - Let admin tune prioritization of #1 vs #2 preferences, or equity vs overall satisfaction
  - *Benefit: Different events may value different tradeoffs*

- [ ] **#004 - Protected groups/accommodations** - Flag volunteers with accessibility needs, childcare constraints, or role restrictions
  - *Benefit: Ensure ADA compliance and handle real-world constraints*

- [ ] **#005 - Conflict-of-interest handling** - Prevent specific volunteer pairs from being assigned together (or require them together)
  - *Benefit: Handle interpersonal dynamics, supervision requirements, buddy systems*

- [ ] **#006 - Transparency report** - Generate document explaining algorithm, constraints, and assignment rationale
  - *Benefit: Preempt complaints; demonstrate fair process*

- [ ] **#007 - Multiple solution comparison** - Run solver with different seeds and compare outcomes
  - *Benefit: Demonstrate results are stable, not just one lucky/unlucky configuration*

---

## 2. Shift Lead Perspective (Operational Focus)

- [ ] **#008 - Input validation with clear errors** - Validate shift IDs match, flag volunteers with no valid preferences before solving
  - *Benefit: Catch data entry errors before wasting time on failed solves*

- [ ] **#009 - "What-if" scenarios** - Save current solution, tweak assignments manually, see impact
  - *Benefit: Handle last-minute changes ("Alex dropped out, who can cover?")*

- [ ] **#010 - Manual override capability** - Lock certain assignments before solving, or manually swap after
  - *Benefit: Real-world always has exceptions; support them gracefully*

- [ ] **#011 - Email/notification templates** - Generate personalized messages for each volunteer with their assignments
  - *Benefit: Reduce communication burden; ensure consistent messaging*

- [ ] **#012 - Shift roster printouts** - One-page-per-shift view with assigned volunteers, contact info, timing
  - *Benefit: Useful for day-of operations*

- [ ] **#013 - Undo/history** - Track changes and allow rollback
  - *Benefit: Don't lose work when mistakes happen*

- [ ] **#014 - Progress indicator during solve** - Show meaningful progress (Phase 1/2, % complete)
  - *Benefit: Long solves less stressful when progress is visible*

- [ ] **#015 - Infeasibility diagnosis** - When no solution exists, explain WHY (which constraints conflict)
  - *Benefit: Currently just says "infeasible" - make it actionable*

- [ ] **#016 - Partial preference support** - Handle volunteers who only ranked 2-3 shifts instead of 5
  - *Benefit: Real data is messy; handle gracefully*

- [ ] **#017 - Save/load projects** - Save parsed data + results to reload later
  - *Benefit: Don't re-upload and re-solve for minor changes*

---

## 3. Volunteer Perspective (Experience & Understanding Focus)

- [ ] **#018 - Personal assignment explanation** - "You got Shift 24 (your #1) and Shift 13 (your #2), totaling 6.5 points"
  - *Benefit: Volunteers understand what they got and that preferences were respected*

- [ ] **#019 - Preference collection form** - Built-in form instead of requiring Excel data entry
  - *Benefit: Reduces friction and data entry errors*

- [ ] **#020 - Preference confirmation** - Show volunteers what the system received before solving
  - *Benefit: Catch mistakes before they affect assignments*

- [ ] **#021 - Assignment notification with context** - Email showing shifts, times, locations, plus preference satisfaction
  - *Benefit: Proactive communication reduces questions*

- [ ] **#022 - Appeal/feedback mechanism** - Way to flag issues with assignments
  - *Benefit: Volunteers feel heard even if nothing changes*

- [ ] **#023 - Calendar export (ICS)** - One-click add shifts to personal calendar
  - *Benefit: Practical convenience; reduces no-shows*

- [ ] **#024 - Shift details visibility** - Show role descriptions, locations, what to bring
  - *Benefit: Volunteers know what they're signing up for*

- [ ] **#025 - Preference guidance** - Help text explaining ranking system with tips
  - *Benefit: Better input quality leads to better matches*

---

## 4. Cross-Cutting Improvements

- [ ] **#026 - Mobile-friendly UI** - Responsive design for phone/tablet
  - *Benefit: Shift leads often work from phones on-site*

- [ ] **#027 - Dark mode**
  - *Benefit: Accessibility and user preference*

- [ ] **#028 - Offline capability** - PWA that works without internet
  - *Benefit: Events often have poor connectivity*

- [ ] **#029 - Multi-event support** - Handle multiple events/camps in one instance
  - *Benefit: Organizations often run several events*

- [ ] **#030 - Role-based access** - Admin vs Shift Lead vs Volunteer views
  - *Benefit: Different people need different capabilities*

- [ ] **#031 - Audit logging** - Track who changed what and when
  - *Benefit: Accountability and debugging*

---

## Prioritization

### High Impact, Lower Effort
- [ ] #008 - Input validation with clear errors
- [ ] #015 - Infeasibility diagnosis
- [ ] #011 - Email/notification templates
- [ ] #018 - Personal assignment explanation in results

### High Impact, Higher Effort
- [ ] #019 - Preference collection form (replaces Excel input)
- [ ] #010 - Manual override capability
- [ ] #002 - Year-over-year tracking

---

## Completed


*Items will be moved here as they are implemented*
