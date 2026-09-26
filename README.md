GeoFS-Livery-Switcher
A livery browser userscript for GeoFS. Press Shift to open the panel and browse, search, and switch liveries for the current aircraft.

Features
🎨 One-click livery swap — click a card to apply, silent and instant

✈️ Aircraft-aware filtering — detects the current aircraft ID and only shows matching liveries

🔍 Search and type filter — find liveries by name, author, or tags

⌨️ Keyboard shortcut — press Shift to toggle the panel

🖱️ Draggable panel — hold the title bar to move it anywhere

🖥️ Cursor-following glow — smooth gradient highlight that follows your mouse

🧪 Test Livery — drop an image straight onto a slot to preview it without editing livery.json

🧩 Per-part slots — swap fuselage, wing, or shader textures independently

🌐 Remote data — liveries are loaded from a remote livery.json, no script updates needed to add new ones

Installation
Requirements
Browser: Chrome / Edge / Firefox / Safari

Script manager: Tampermonkey (free)

Steps
Install the Tampermonkey browser extension

Open the Tampermonkey dashboard → Create a new script

Paste the full contents of geofs-livery-switcher.user.js

Press Ctrl + S to save

Open GeoFS and press Shift to open the panel

Usage
Action	How
Show / hide panel	Press Shift
Move panel	Drag the title bar
Search liveries	Type a livery name, author, or aircraft in the search box
Filter by type	Click the All Liveries dropdown
Apply a livery	Click a livery card
Reload data	Click the ↻ button in the footer
Test Livery
The Test Livery button at the bottom of the panel opens a modal that lists every texture slot for the current aircraft, grouped by its labels definition.

For each group you can:

Click LOAD IMAGE to pick a file

Drag an image onto the row to apply it directly

The image is applied temporarily to the current aircraft — it is not saved to livery.json, and reloading the page restores the original livery.