# Dead-Band
Ham Test game

A web-based game to help players pass the US amateur radio (HAM) exams. The UI is a transceiver: you type the frequency and set mode, offset, CTCSS/DCS, power, and antenna to contact NPC stations, who give clues (and exam questions) leading to the next one.

## Run
    npm start        # serves on http://localhost:8000
    npm test         # radio/scenario logic tests

## Writing scenarios
### Create a chapter
1. Create a JSON file in `data/` named for its chapter, for example `scenario2.json`. Chapter 1 is `data/scenario1.json`.
2. Start with the structure below. Give the chapter its own title, day, local time, weather, and station list. A station's conversation starts at the node named by `conversation.start`.
3. Add the new file to the end of `data/chapters.json`. The list order determines chapter order; use a unique `id` and the exact JSON filename.
4. Mark the final response of the chapter with `"chapterComplete": true` and `"next": null`. This is what lets the player advance.
5. Run `npm test` and open/reload the app with `npm start` to verify the scenario.

```json
{
  "title": "Dead Band — Chapter 2: Example",
  "chapterTitle": "Example",
  "day": "Day 2",
  "time": "08:15",
  "weather": "Clear, light wind",
  "intro": "Opening narration for this chapter.",
  "features": { "dtmf": false },
  "stations": [
    {
      "id": "chapter-2-contact",
      "name": "Example Station",
      "match": { "frequency": 146.55, "mode": "FM" },
      "conversation": {
        "start": "hello",
        "nodes": {
          "hello": {
            "text": "Station opening message.",
            "responses": [
              {
                "text": "Player reply.",
                "next": null,
                "chapterComplete": true
              }
            ]
          }
        }
      }
    }
  ]
}
```

Add the chapter to `data/chapters.json`:

```json
{
  "chapters": [
    { "id": "chapter-1", "file": "scenario1.json" },
    { "id": "chapter-2", "file": "scenario2.json" }
  ]
}
```

To edit the current chapter in the app, use the Scenario Editor. Changes are saved in browser localStorage per chapter; use **Download JSON** to save an edited chapter as a file, then put it in `data/` and add it to the manifest if it is a new chapter.

The interface separates transceiver controls from station configuration. Radio settings include frequency, mode, power (1/5/10/25/50/100 W), repeater shift/offset, CTCSS TX/RX, DCS, squelch, bandwidth, RIT, reverse, and DMR color code/talkgroup/time slot (shown in Digital mode). Station settings include antenna and dummy load, orientation/direction/height, tuner, SWR estimate, feed line, power supply, preamp, and attenuator.

Station `match` fields are optional requirements. Supported fields include `frequency`, `mode`, `offset`, `ctcssTx`, `ctcssRx`, `dcs`, `bandwidth`, `ritHz`, `reverse`, `dmr` (`colorCode`, `talkgroup`, `timeSlot`), `antenna`, `antennaOrientation`, `antennaDirection` (degrees, with optional `antennaDirectionTolerance`), `minAntennaHeight`, `maxAntennaHeight`, `tuner`, `feedLine`, `powerSupply`, `preamp`, `attenuator`, `minPower`, and `maxPower`. Omitted fields do not constrain the player.

DTMF is chapter-gated: add `"features": {"dtmf": true}` to a chapter to show its keypad; otherwise it is hidden. This unlock is chapter-specific and does not carry into other chapters. To define responses, add a station `dtmfSequences` object whose keys are digit sequences and whose values are response text. The keypad accepts digits 0–9, A–D, `*`, and `#`. The current chapter has DTMF disabled. Stations may set `signalStrength` (0–10); preamp, attenuator, RF gain, and squelch affect the displayed/received signal.

Each station has a `conversation` graph: nodes with `text` and player `responses` (`text`, `next`, optional `feedback`/`correct`). A `next` of `null` ends the contact. Stations may also have `beacon` text heard on Listen.
