# Dead-Band
Ham Test game

A web-based game to help players pass the US amateur radio (HAM) exams. The UI is a transceiver: you type the frequency and set mode, offset, CTCSS/DCS, power, and antenna to contact NPC stations, who give clues (and exam questions) leading to the next one.

## Run
    npm start        # serves on http://localhost:8000
    npm test         # radio/scenario logic tests

## Writing scenarios
Edit `data/scenario.json` or use the in-app Scenario Editor (saved in browser localStorage). Each station has a `match` (frequency, mode, offset, ctcssTx, ctcssRx, dcs, antenna, minPower, maxPower; omitted fields are ignored) and a `conversation` graph: nodes with `text` and player `responses` (`text`, `next`, optional `feedback`/`correct`). A `next` of `null` ends the contact. Stations may also have `beacon` text heard on Listen.
