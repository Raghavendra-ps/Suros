# SUROS Mobile Responsiveness Fix Instructions

## CRITICAL RULES
- Only add/modify CSS inside `@media (max-width: 768px)` blocks in `Dashboard.css`
- Do NOT change any desktop layout, logic, colors, fonts, or component structure
- Do NOT touch `App.jsx` component logic — only CSS and inline style overrides where absolutely necessary
- Do NOT change any Chart.js options or data
- Every fix must be scoped to mobile breakpoint only

---

## 1. Header — Logo & Icon Alignment

**Problem:** SUROS text logo is too large on mobile. Theme toggle and settings icons are misaligned.

**Fix in `Dashboard.css` under `@media (max-width: 768px)`:**

```css
@media (max-width: 768px) {
  .suros-title-text {
    font-size: 1.3rem !important;
    margin-left: 8px !important;
  }

  header img {
    height: 24px !important;
  }

  .header-right {
    gap: 0.4rem !important;
  }

  .header-icon-btn {
    width: 32px;
    height: 32px;
    padding: 4px;
  }

  header {
    padding: 0 1rem;
    height: 52px;
  }
}
```

---

## 2. CPU Metrics Card

**Problem:** The 3-column grid (gauge + stats + core bars) is too wide for mobile. Everything overflows.

**Fix:** Stack the three columns vertically on mobile.

```css
@media (max-width: 768px) {
  /* The CPU card uses an inline grid with gridTemplateColumns: '160px 1.2fr 3.8fr' */
  /* Target the direct child div inside the CPU bento card */
  .bento-grid .panel .stat-label + div[style*="grid"] {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }

  .cpu-gauge-wrap {
    align-self: center;
    margin: 0 auto;
  }

  .cpu-gauge-svg {
    width: 120px !important;
    height: 70px !important;
  }

  .core-bar-grid {
    gap: 2px !important;
  }

  .core-bar-item {
    min-width: 8px !important;
    height: 56px !important;
  }

  .core-bar-track {
    height: 44px !important;
  }
}
```

> **Note:** The CPU card's inner layout is set via inline `style` on the div. If the CSS selector above doesn't apply, add a className `cpu-metrics-inner` to that div in `App.jsx` and target `.cpu-metrics-inner` instead. This is the only acceptable `App.jsx` change — adding a className only, no logic changes.

---

## 3. Response Time Card (Server Outages / Bento Card 8)

**Problem:** The card has `maxHeight: 160px` set inline which clips the chart on mobile. The three-column layout (outages | chart | avg latency) is too compressed.

**Fix:** On mobile, stack the layout vertically and remove the maxHeight constraint.

Add className `response-time-card` to the outer div of Bento Card 8 in `App.jsx` (the `stat-card neutral span-12` div). This is the only acceptable `App.jsx` change here.

Then in CSS:

```css
@media (max-width: 768px) {
  .response-time-card {
    max-height: none !important;
    height: auto !important;
  }

  .response-time-card > div {
    flex-direction: column !important;
    gap: 1rem !important;
  }

  /* The headers row */
  .response-time-card > div > div:first-child {
    flex-direction: column !important;
    gap: 0.25rem !important;
  }

  /* The content row */
  .response-time-card > div > div:last-child {
    flex-direction: column !important;
    gap: 1rem !important;
    align-items: stretch !important;
  }

  /* Chart container — give it a fixed height so it renders */
  .response-time-card .recharts-responsive-container,
  .response-time-card > div > div:last-child > div[style*="flex: 1"] {
    height: 120px !important;
    flex: none !important;
    width: 100% !important;
  }

  /* Right side avg latency — left align on mobile */
  .response-time-card > div > div:last-child > div:last-child {
    text-align: left !important;
    min-width: unset !important;
  }

  /* Left side outages — remove min-width */
  .response-time-card > div > div:last-child > div:first-child {
    min-width: unset !important;
  }
}
```

---

## 4. Monitored Sites — Count Badge Alignment

**Problem:** The green/red count badges next to "Monitored Sites" title are misaligned on mobile.

**Fix:**

```css
@media (max-width: 768px) {
  .panel-title {
    flex-wrap: wrap !important;
    gap: 6px !important;
    font-size: 0.6rem !important;
  }

  .panel-header {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 0.75rem !important;
    padding: 1rem !important;
  }

  /* Keep Add Site button full width on mobile */
  .panel-header .btn-accent {
    align-self: stretch !important;
    text-align: center !important;
  }
}
```

---

## 5. Drives Monitoring Card

**Problem:** The drives grid is 2-column which is too wide. Individual drive cards overflow with their 4-column metrics grid.

**Fix:**

```css
@media (max-width: 768px) {
  .drives-grid {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }

  .drive-card {
    height: auto !important;
    min-height: unset !important;
    max-height: unset !important;
    /* Reset alternating border sides to always be left */
    border-left: 5px solid var(--up) !important;
    border-right: 1px solid var(--border) !important;
  }

  /* Override inline border styles set per-card in App.jsx */
  .drive-card[style] {
    border-right: 1px solid var(--border) !important;
  }

  .drive-metrics-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 1rem !important;
  }

  .drive-metric-value {
    font-size: 1rem !important;
  }

  .drive-title {
    font-size: 0.75rem !important;
  }

  .drive-updated {
    font-size: 0.58rem !important;
  }
}
```

---

## 6. Settings Drawer — Mobile Redesign

**Problem:** The settings drawer is 580px wide with a split sidebar+fields layout that doesn't fit on mobile.

**Fix:** On mobile, collapse the sidebar tabs to a horizontal tab row at the top, and make the drawer full-width.

```css
@media (max-width: 768px) {
  .settings-drawer {
    width: 100vw !important;
    max-width: 100vw !important;
  }

  .drawer-split-layout {
    flex-direction: column !important;
  }

  .drawer-sidebar {
    width: 100% !important;
    border-right: none !important;
    border-bottom: 1px solid var(--border) !important;
    flex-direction: row !important;
    padding: 0 !important;
    overflow-x: auto !important;
    overflow-y: visible !important;
  }

  .sidebar-tab-btn {
    border-left: none !important;
    border-bottom: 3px solid transparent !important;
    padding: 0.75rem 1rem !important;
    white-space: nowrap !important;
    font-size: 0.75rem !important;
  }

  .sidebar-tab-btn.active {
    border-left: none !important;
    border-bottom-color: var(--accent) !important;
    background: transparent !important;
  }

  .drawer-fields-container {
    padding: 1rem !important;
  }

  .drawer-header {
    padding: 1rem !important;
  }

  .drawer-header h2 {
    font-size: 1rem !important;
  }

  .settings-save-row {
    flex-direction: column !important;
  }

  .settings-save-row .btn {
    width: 100% !important;
    text-align: center !important;
    margin-left: 0 !important;
  }
}
```

---

## 7. General Bento Grid Mobile Fixes

```css
@media (max-width: 768px) {
  .bento-grid {
    gap: 1rem !important;
    margin-bottom: 2rem !important;
  }

  .main {
    padding: 1rem !important;
  }

  /* Stat cards inside bento should not clip */
  .bento-grid .stat-card {
    overflow: visible !important;
  }

  /* Summary stat cards stack to 2-col on small screens */
  .summary-row {
    grid-template-columns: 1fr 1fr !important;
  }
}
```

---

## Summary of `App.jsx` Changes Allowed

Only two className additions are permitted — no logic, no structural changes:

1. Add `className="cpu-metrics-inner"` to the inner `<div>` with the 3-column CPU grid (the one with `style={{ display: 'grid', gridTemplateColumns: '160px 1.2fr 3.8fr', ... }}`)

2. Add `className="response-time-card"` to the outer `<div>` of Bento Card 8 (currently `className="stat-card neutral span-12"` → change to `className="stat-card neutral span-12 response-time-card"`)

All other fixes are pure CSS.

---

## Testing Checklist

After applying all fixes, verify on a 390px wide viewport (iPhone 14 size):

- [ ] Header logo is small and fits, icons are aligned to the right
- [ ] CPU card stacks vertically: gauge → stats → core bars
- [ ] Response time chart renders fully below the outages/latency numbers
- [ ] Monitored Sites header shows title + badges + button cleanly
- [ ] Drive cards are single column, metrics show in 2×2 grid
- [ ] Settings drawer is full width with horizontal tabs at top
- [ ] No horizontal scroll on any card
- [ ] Dark/light toggle still works