# Chatlog Lens
Live page: https://aamirtechs.github.io/chatlog-lens/

Open a WhatsApp or live-chat export as a readable, searchable conversation with first-response and resolution stats, not a word cloud. It solves a recurring, specific job for the people who hit it every week, in one local page with no account and no upload.

## Features
- Parse WhatsApp .txt exports in both iOS and Android formats, plus generic chat CSV files with sender, timestamp and message columns.
- Read the conversation as chat bubbles and search it by word or sender.
- See response time stats per participant: median, p90 and average, with an optional business hours only view.
- Spot the longest silences and the unanswered last message before a chat goes cold.
- Export a stats CSV and a redacted transcript with emails and phone numbers masked, safe to attach to a ticket.

## How it works
Load or paste your input in the tool card, set the options, and run it. All parsing, checking and file generation happens locally in the page, and you download the result (a report, a converted file, or a corrected snippet) straight from the browser. It runs entirely in the browser.

## Privacy
Runs 100% in your browser. Your files never leave this device, nothing is uploaded,
and there is no tracking.

## Development
Core logic lives in `src/logic.js` and is shared by the page and the tests.
Run the tests with `npm test`.

## License
MIT, Copyright 2026 Amir Hussain.
