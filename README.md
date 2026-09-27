# GeoFS Livery Switcher

**A livery browser userscript for GeoFS. Press Shift to open the panel and browse, search, and switch liveries for the current aircraft.
Features**

🎨 One-click livery swap — click a card to apply, silent and instant
✈️ Aircraft-aware filtering — detects the current aircraft ID and only shows matching liveries
🌍 Country filtering — a Countries dropdown sits right under the type dropdown; pick a country to show only its liveries
🏳️ Flag per livery — each livery shows its country's flag (flat SVG) right after the name, auto-generated from its country field
🔍 Search by name or author — type in the search box to filter by livery name or author
⌨️ Keyboard shortcut — press Shift to toggle the panel
🖱️ Draggable panel — hold the title bar to move it anywhere
🖥️ Cursor-following glow — smooth gradient highlight that follows your mouse
🧪 Test Livery — drop an image straight onto a slot to preview it without editing livery.json
🧩 Per-part slots — swap fuselage, wing, or shader textures independently
🌐 Remote data — liveries and country/flag data are loaded from remote JSON files, so adding new liveries or countries needs no script update

# Installation and Requirements
Browser: Chrome / Edge / Firefox / Safari
Script manager: Tampermonkey (free)
Steps
1. Install the Tampermonkey browser extension
2. Open the Tampermonkey dashboard → Create a new script
3. Paste the full contents of geofs-livery-switcher.user.js
4. Press Ctrl + S to save
5. Open GeoFS and press Shift to open the panel
The script also fetches livery.json and flags.json from this repository at runtime, so both files must be present on the main branch (see below).

# Usage
**Action**
Press Shift Show / hide panel

# Test Livery
The Test Livery button at the bottom of the panel opens a modal that lists every texture slot for the current aircraft, grouped by its labels definition.
For each group you can:
- Click LOAD IMAGE to pick a file
- Drag an image onto the row to apply it directly
The image is applied temporarily to the current aircraft — it is not saved to livery.json, and reloading the page restores the original livery.

# Country classification
Countries are a first-class filter. They are fully data-driven — nothing about them is hard-coded in the script.