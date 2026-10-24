# Discord Wrapped 🎉

A Spotify-Wrapped–style analytics dashboard that turns a Discord data export into a beautiful, interactive year-in-review.

**[Live Demo →](https://ezariago.github.io/DiscordVisualizer)**

---

## Features

| Section | What you get |
|---|---|
| **Hero** | Avatar, username, Discord badges, lifetime message + word count |
| **Stat Cards** | Total messages, estimated words, peak hour/day/month, spending, reactions, voice joins |
| **Personality** | Rule-based classifier — Night Owl, Essay Writer, Legendary Yapper, and more |
| **Activity Heatmap** | GitHub-style purple heatmap built from real message timestamps, with streak tracking |
| **6 Charts** | Hourly, weekday, monthly, yearly trends; top channels & top DMs |
| **The Fun Stuff** | Emoji leaderboard, word cloud, cursed-word hall of fame, behind-the-scenes behavior stats |
| **Story Mode** | 10-slide full-screen Wrapped experience with PNG export |
| **Filters** | Year, month, activity type — all charts update live |
| **Data Quality** | Import summary, date range, estimated word count (sample-based) |

## Stack

- **HTML5 / CSS3** — custom Discord dark theme with blurple accents
- **Tailwind CSS** (CDN) — utility classes
- **Chart.js 4** — all charts with hover tooltips
- **Vanilla JavaScript** — zero frameworks, zero build step
- **html2canvas** — Story Mode PNG export

## Usage

1. Clone the repo
2. Get your Discord data export (`Settings → Privacy & Safety → Request all of my data`)
3. Place your `data.json` in the project root
4. Open `index.html` in a browser — or run a local server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

5. Click **"Use bundled data.json"**, or drag & drop your own file

> **Privacy:** All processing happens locally in your browser. No data is ever uploaded.

## Data Format

Built for the [Discord Data Package](https://discord.com/privacy) `data.json` export format (as produced by tools like [DiscordDataPackageExplorer](https://github.com/Androz2091/discord-data-package-explorer)).

Expected top-level structure:

```json
{
  "user": { "username": "...", "avatar": "..." },
  "messages": {
    "messageCount": 833089,
    "hoursValues": { "hourly": [...], "daily": [...], "monthly": [...], "yearly": [...] },
    "topChannels": [...],
    "topDMs": [...],
    "topEmojis": [...],
    "favoriteWords": [...],
    "oldestMessages": [...]
  },
  "statistics": { "addReaction": 1390, ... },
  "payments": { "total": 229.94, ... }
}
```

## License

MIT
