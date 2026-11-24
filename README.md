# Clipdeck

A Chrome/Edge extension that watches a Microsoft Teams meeting tab and automatically saves **each new, unique slide** into a Word (`.docx`) file, so you can study later if you can't attend the class.

- Saves a slide only after it has stayed still for a moment (skips transitions)
- Never saves the same slide twice, even if the presenter stays on it or goes back to it
- Ignores other tabs/windows: if the presenter leaves the slides, nothing is saved
- Runs 100% locally. No server, no network requests, no audio recording

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin **Clipdeck** to the toolbar.

## Use

1. Join the meeting with **Teams in the browser** (not the desktop app).
2. When a slide is on screen, click the Clipdeck icon, then **Start**.
3. **Step 1:** drag a box around *only the slide*.
4. **Step 2:** drag a thin box over something that looks the same on every slide while the presenter is in PowerPoint (e.g. the ribbon tabs: Home, Insert, Design...). Press Esc to skip this check.
5. Watch the badge on the icon: **green** = saving, **orange** = presenter is on something else.
6. Click **Stop & save** at the end. A file like `Teams-slides-2026-11-23_10-30.docx` is saved to your Downloads folder.

Other buttons: **Save Word doc now** (backup copy, keeps running) and **Re-select boxes** (if the layout changes, keeps saved slides).

## How it works

- `chrome.tabCapture` streams the tab's video into a hidden offscreen page.
- Every 0.5s the slide area is shrunk to a 160x90 grayscale thumbnail and compared to the previous frame.
- When the picture has been still for 1.5s and differs enough from the last saved slide **and** from every earlier saved slide, a full-resolution JPEG is kept.
- A second box (the "anchor") is compared against how it looked at the start (light/dark inverted too) to tell whether the real slide deck is showing.
- On stop, a dependency-free writer builds the `.docx` (hand-written zip + WordprocessingML) and downloads it.

## Tuning

Edit the `CFG` block at the top of `offscreen.js`, then reload the extension:

| Setting | Meaning |
|---|---|
| `newFrac` | Lower = more sensitive to small slide changes (default `0.03`) |
| `dupFrac` | Higher = more aggressive duplicate skipping (default `0.02`) |
| `settleMs` | How long the slide must stay still before saving (default `1500`) |
| `anchorFrac` | How strictly the anchor box must match (default `0.15`) |

## Limitations

- Needs Teams in the browser; the desktop app can't be tab-captured.
- If the presenter resizes the window or enters full-screen slideshow, click **Re-select boxes**.
- Bullet-by-bullet animation builds may save only the first version of a slide.
- Slides are kept in memory until you save, so click **Save Word doc now** now and then during long classes.
- Some meetings block screen capture (the result may be blank).

## Privacy and fair use

Nothing leaves your computer. Check your institution's rules before capturing class content, and use the output for personal study.

## License

MIT
