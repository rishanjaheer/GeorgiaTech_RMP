# RMP for Georgia Tech

A Google Chrome extension that automatically displays [Rate My Professors](https://www.ratemyprofessors.com) ratings for instructors listed on Georgia Tech's OSCAR course registration system.

When you search for classes on OSCAR, the extension injects professor ratings inline next to each instructor's name — no extra clicks required.

## Features

- Works on both the **classic OSCAR interface** (`oscar.gatech.edu`) and the **newer Banner self-service interface** (`registration.banner.gatech.edu`)
- Color-coded rating badges (green ≥ 4.0, yellow 3.0–3.9, red < 3.0)
- Shows difficulty, "would take again" percentage, and number of ratings
- Click any badge to open the professor's RMP profile
- Session caching to minimize API calls
- Enable/disable toggle via the extension popup

## Installation (Unpacked)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `rmp-gatech/` folder from this repository.
6. Navigate to [OSCAR](https://oscar.gatech.edu/) and search for courses — ratings should appear next to instructor names.

## Usage

1. Go to `https://oscar.gatech.edu/bprod/bwckschd.p_disp_dyn_sched` (or the newer Banner registration site).
2. Select a term and search for courses in any subject (e.g., CS, MATH, ECE).
3. RMP badges will appear next to instructor names in the search results.
4. Click a badge to open the professor's Rate My Professors page.
5. Use the extension popup to disable the extension if needed (requires a page refresh for existing badges to stop appearing on new searches).

## RMP GraphQL API

This extension uses Rate My Professors' public GraphQL endpoint:

- **Endpoint:** `https://www.ratemyprofessors.com/graphql`
- **Georgia Tech School ID:** `U2Nob29sLTM2MQ==` (base64 encoding of `School-361`)

The extension searches for professors by name at Georgia Tech and retrieves:

- Overall rating (0.0–5.0)
- Average difficulty (0.0–5.0)
- Number of ratings
- "Would take again" percentage

Requests use the standard browser client authorization header (`Basic dGVzdDp0ZXN0`) that RMP's web app uses. API calls and session caching are handled by the background service worker (content scripts cannot access `chrome.storage.session` directly).

## Icons

The included icons are simple GT-themed placeholders (gold "T" on navy background). Before publishing to the Chrome Web Store, you may want to replace them with higher-quality versions:

- `icons/icon16.png` — 16×16 px
- `icons/icon48.png` — 48×48 px
- `icons/icon128.png` — 128×128 px

Suggested design: Georgia Tech gold (`#B3A369`) letter "T" or "RMP" on navy (`#003057`) background.

## Known Limitations

- **Name matching:** Professors with common last names may match the wrong person on RMP. The extension queries by full name when available (`First Last` format) but RMP returns only the top result.
- **Incomplete data:** RMP data is crowd-sourced and may be missing or outdated for some professors.
- **Limited ratings:** Professors with fewer than 3 ratings display a warning icon indicating limited data.
- **Dynamic pages:** The newer Banner interface loads content asynchronously; there may be a brief delay before badges appear.
- **Not on RMP:** Some GT instructors (especially new hires or adjuncts) may not have RMP profiles.

## File Structure

```
rmp-gatech/
├── manifest.json       # Extension manifest (Manifest V3)
├── content.js          # Core logic: DOM parsing, API calls, badge injection
├── background.js       # Service worker (install listener)
├── popup.html          # Extension popup UI
├── popup.js            # Popup toggle logic
├── styles.css          # Badge and tooltip styles
├── icons/              # Extension icons
└── README.md
```

## Testing Without Registration

You do **not** need to register for classes to test the extension. Registration and schedule viewing are separate on OSCAR.

### Option 1: OSCAR schedule search (no registration needed)

1. Go to [OSCAR Schedule of Classes](https://oscar.gatech.edu/bprod/bwckschd.p_disp_dyn_sched).
2. Pick any term and search a subject (e.g. **CS**, **MATH**, **ECE**).
3. Open any course section — instructor names should get RMP badges.

This works even outside the registration window.

### Option 2: Local mock page

A mock OSCAR page is included for offline testing:

```bash
cd rmp-gatech
python3 -m http.server 8080
```

Then open `http://localhost:8080/test/oscar-mock.html` in Chrome (with the extension loaded). You should see badges appear next to sample instructor names. Click **Load another course section** to test dynamic injection.

Check the browser console for `[RMP GT]` logs (cache hits, API calls, errors).

### Option 3: Popup and API smoke test

- Click the extension icon — confirm the enable toggle and GT styling work.
- On any page, open DevTools → Console and verify the extension loaded without errors after visiting the mock page or OSCAR.

## Development

No build step required — this is plain vanilla JavaScript. After making changes:

1. Go to `chrome://extensions/`.
2. Click the refresh icon on the extension card.
3. Reload the OSCAR page to test.

## License

This project is not affiliated with Georgia Tech or Rate My Professors. Use at your own discretion.
