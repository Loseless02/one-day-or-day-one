# One Day or Day One

A local to-do app built around one idea: stop saying "one day," start saying "day one," and make finishing things feel good.

## Run

Open `index.html` in a browser. No install, no build, no server, no account. Data lives in the browser's `localStorage`; use **Settings → Export backup** to save a `.json` copy. (Opened straight from disk, the browser blocks the recorded instruments, so the synthesized ones play instead. Hosted or in the desktop app, you get the real sax and piano.)

## Desktop app (Windows, macOS, Linux)

The same app in its own window, living in the tray:

- **Runs in the background.** Closing the window keeps it in the tray (turn off in Settings → Desktop app).
- **Start at login**, optionally hidden in the tray until you need it.
- **Global shortcut** (default `Ctrl+Shift+Space`, `Cmd+Shift+Space` on Mac): press it from any app to bring One Day or Day One forward, press again to send it back. In Settings you can record any combination (including a single F-key or media key), pick a preset, choose "shows and hides" or "always shows", hide it automatically when you click elsewhere, and choose whether the cursor waits in the quick-add box.
- **Type right away.** When it appears, just type and press Enter. The task lands in One Day (or Day One, your choice) and you can type the next one immediately.

Build it yourself:

```bash
npm install
npm start               # run in development
npm run dist:win        # Windows installer + portable .exe  (on Windows)
npm run dist:mac        # .dmg + .zip                         (on a Mac)
npm run dist:linux      # AppImage + .deb                     (on Linux)
```

Each platform has to be built on that platform (macOS apps can only be built on a Mac). `.github/workflows/desktop.yml` builds all three on GitHub's machines: push the project to GitHub, open **Actions → Desktop builds → Run workflow**, and download the installers from the finished run.

The builds are not code-signed, so the first launch shows a warning: on Windows click **More info → Run anyway**; on macOS right-click the app → **Open**. On Linux, AppImage needs `chmod +x` first. Global shortcuts can be blocked on some Linux Wayland desktops; if so, bind the keys to the app in your system keyboard settings.

## Install on iPhone / in a browser

It's a Progressive Web App. Host the folder on any static HTTPS host (GitHub Pages, Cloudflare Pages, Netlify), then:

- **iPhone:** open the URL in Safari → Share → **Add to Home Screen**. Opens full-screen, works offline.
- **Windows / Mac:** open it in Chrome or Edge → install icon in the address bar.

Each device keeps its own data. Move data between devices with Export / Import.

## Passcode

Settings → Passcode sets a 4-digit code. The app asks for it on launch and after time in the background (immediately, 1, 5 or 15 minutes). Only a salted SHA-256 hash is stored. It is a privacy screen, not encryption: someone with developer tools on the same browser can still read the task data. A forgotten code cannot be recovered; the only way back in is erasing the app's data on that device.

## What makes it different

- **Two lanes, not one list.** *One Day* holds someday tasks, and they visibly gather dust (fresh → dusty → cobwebs). *Day One* is today. Pulling a task across blows the dust off.
- **Hold to complete.** Press and hold the orb. A rising tone builds while it fills; let go early and nothing happens. Release at full charge for the payoff.
- **Loot drops.** Every win rolls a relic: Common, Rare, Epic or Legendary. Rarity is random, so you never know which win will be the big one. A pity timer guarantees Epic+ within 12 wins. Collect all 36 in the **Vault**.
- **Combos.** Wins within 20 minutes of each other chain. Higher combo = more XP, better odds, and each completion note climbs higher up the scale.
- **Critical hits.** 12% of wins deal double XP.
- **Boss of the day.** Crown one task; only one boss can be slain per day. Its strength comes from how long you've avoided it (days since it was created): Minion 2× (0–2 days), Boss 3× (3–7), Elite 4× (8–20), Dread 5× (21+). Stronger bosses take longer to hold, drop better loot and explode harder.
- **2-minute ignition.** For the task you're avoiding: commit only to starting. Survive two minutes and you get XP for starting, plus a bonus when you finish.
- **Your day is a jazz tune.** Every win is a melody note over jazz chords (Cmaj9, Am11, Fmaj9#11). Hit the ♪ button and today plays back swung, with piano comping, walking bass and ride cymbal. Level-ups play a ii–V–I turnaround; boss kills hit an altered chord that resolves.
- **Your Sky.** Every finished task becomes a star, sized and colored by its loot. Each day's wins join into a constellation; perfect days glow gold. Click any star to hear that day's song.
- **Streaks, reframed.** Breaking a streak doesn't shame you. It starts *Day One #n*, and the app counts how many times you restarted.
- **Perfect day.** Finish everything you committed to and the day is marked "cleared" with its own celebration.
- **Live background.** The backdrop follows the real time of day: dawn, day, dusk, night.
- **Motion everywhere.** XP motes fly into the level ring, relics fly into the Vault tab, cards physically travel between lanes, tabs slide, the hero line rises word by word.
- **Swipe.** On touch screens: swipe a One Day card right to commit it, left to delete; swipe a Day One card left to send it back.
- **Heatmap.** The Vault shows your last 18 weeks, with perfect days ringed in gold.

## Customize

Settings has live-preview controls, saved with your backups:

- **Look:** 18 accent colors in two sets (Bright: Dawn, Ember, Gold, Rose, Aurora, Ocean, Forest, Mono; Deep: Crimson, Wine, Plum, Amethyst, Midnight, Abyss, Emerald, Moss, Bronze, Obsidian), tint the background with the accent, background (live time of day or a fixed Dawn / Day / Dusk / Night / Plain), floating embers, font (Clean, Soft, Wide, Serif, Mono), card style (glass / solid / outline), density, corner roundness, orb shape (circle / square / diamond / hex). Text on accent fills is picked automatically to stay readable (4.5:1 contrast) for every color.
- **Motion & rewards:** celebrations (tap to close, auto-close after 3 s or 1.5 s, or toast only), particle style (confetti, stars, hearts, sparks, petals), effect intensity (calm / normal / chaos), screen shake, hold-to-complete speed.
- **Sound & vibration:** sound on/off, style (Jazz: sax over piano and upright bass; Piano; Sax; Rhodes; Choir), volume, vibration on/off and strength. Vibration uses real buzz patterns on Android; on iPhone (iOS 18+) it uses the system haptic tick, since Safari has no vibration API.

## Keys

Just type (no field selected) to start a new task; `Enter` adds it and you keep typing. `Esc` leaves the input.
`Alt+1` `Alt+2` `Alt+3` switch views · `Alt+D` Day One input · `Alt+O` One Day input · `Alt+L` lock · `Enter`/`Space` on a focused orb completes instantly (keyboard access).

## Credits

Recorded instruments (trimmed and level-matched for the app), from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):

- Saxophone: [Karoryfer Samples](https://www.karoryfer.com/karoryfer-samples)
- Piano: [Versilian Studios, VSCO 2 Community Edition](http://vis.versilstudios.net/vsco-community.html)

## Files

```
index.html
manifest.webmanifest, sw.js   PWA install + offline cache
icons/, build/icon.png         app + installer icons (regenerate with: npm run icons)
samples/                      recorded sax and piano notes (see Credits)
desktop/main.js, preload.js   desktop shell: tray, background mode, start at login, global shortcut
css/style.css
js/store.js   state, persistence, streaks, levels
js/audio.js   jazz band: recorded sax + piano, synthesized Rhodes, choir, bass, cymbals, room reverb
js/desktop.js desktop-only settings (shortcut recorder, tray and login options)
js/fx.js      particles, shake, flashes, floating text
js/anim.js    FLIP moves, count-ups, fly-to effects, swipe, tilt, ambient sky
js/prefs.js   customization settings and their controls
js/haptics.js phone vibration (Vibration API, iOS switch-haptic fallback)
js/loot.js    rarity rolls, relics, gem rendering
js/sky.js     constellation canvas
js/lock.js    passcode screen
js/app.js     UI, rewards, overlays, settings
```
