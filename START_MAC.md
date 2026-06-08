# 🍎 How to Start FinanceBot on a Mac

A step-by-step guide to get the bot running on macOS — written for someone who has
never touched a terminal. Follow it top to bottom.

> You only do steps 1–4 **once**. After that, starting the bot is just step 5.

---

## What you need first

- A Mac (this guide is for macOS).
- A **Telegram account**.
- ~10 minutes.

---

## 1. Install Node.js

The bot runs on Node.js (version 18 or newer).

**Easiest way:** download the "LTS" installer from <https://nodejs.org/> and run it.

**Check it worked** — open the **Terminal** app (press `⌘ + Space`, type "Terminal", hit Enter) and run:

```bash
node -v
```

You should see something like `v20.x.x` or higher. If you see "command not found",
the install didn't finish — re-run the installer.

---

## 2. Get your Telegram bot token

1. Open Telegram and search for **@BotFather** (the one with the blue checkmark).
2. Send `/newbot` and follow the prompts (pick a name, then a username ending in `bot`).
3. BotFather replies with a **token** that looks like:
   ```
   123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. **Copy it** — you'll paste it in step 4. Keep it secret (anyone with it controls your bot).

---

## 3. Get the project & install dependencies

In Terminal, go to the project folder and install everything it needs:

```bash
cd ~/Documents/FinanceTracker
npm install
```

This takes a minute or two. It's done when you see a line like `added 284 packages`.

> **If `npm install` fails** with an error about `canvas` or `better-sqlite3`, your Mac
> is missing the build tools. Run these, then `npm install` again:
> ```bash
> xcode-select --install
> brew install pkg-config cairo pango libpng jpeg giflib librsvg
> ```
> (If you don't have `brew`, install it from <https://brew.sh/> first.)

---

## 4. Add your token

Create your settings file from the template and open it:

```bash
cp .env.example .env
open -e .env
```

A text editor opens. Replace the placeholder so the line reads (use **your** token):

```
TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Save (`⌘ + S`) and close the editor.

> **Optional — turn on the AI features.** Chat (just typing a question), receipt photo
> reading, voice notes, and the AI summaries need a free AI key. Add any one of these
> lines to `.env` (Groq is free and fast — get a key at <https://console.groq.com/>):
> ```
> GROQ_API_KEY=your_groq_key
> # GEMINI_API_KEY=your_gemini_key      (best for reading receipt photos)
> # OPENROUTER_API_KEY=your_openrouter_key
> ```
> The bot works fine without these — you just won't get the AI extras.

---

## 5. Start the bot

```bash
npm start
```

You'll know it worked when you see:

```
{"level":"info","scope":"boot","msg":"FinanceBot running"}
[router] All routes registered.
health endpoint listening on :3000
```

Now open Telegram, find your bot, and send `/start`. 🎉

**To stop the bot:** click the Terminal window and press `Control + C`.

---

## Keeping it running in the background

`npm start` stops as soon as you close Terminal. To keep the bot alive after you
close the window:

```bash
nohup npm start > bot.log 2>&1 &
```

- See what it's doing: `tail -f bot.log`
- Stop it later: `pkill -f "node index.js"`

For a more robust always-on setup, use [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name financebot
pm2 logs financebot      # view logs
pm2 restart financebot   # restart after changes
pm2 stop financebot      # stop
```

---

## Updating after code changes

```bash
cd ~/Documents/FinanceTracker
git pull              # if you use git
npm install           # in case dependencies changed
npm start
```

The database upgrades itself automatically on start (you'll see `[migrations] Applied …`).
Your data is safe — a `.bak` backup is made before any migration.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `❌ Config errors: telegram.bot_token is REQUIRED` | Your `.env` is missing or the token line is wrong. Re-check step 4. |
| `command not found: node` | Node isn't installed — redo step 1. |
| `npm install` fails on `canvas` / `better-sqlite3` | Run the `xcode-select` + `brew install` commands in step 3. |
| Bot starts but doesn't reply in Telegram | The token is wrong/expired. Make a new one with @BotFather and update `.env`. |
| `EADDRINUSE` / port 3000 in use | Something else uses port 3000. Start with `HEALTH_PORT=3001 npm start` (or `HEALTH_PORT=off`). |
| "no AI provider configured" warning | Normal — the bot runs without AI. Add a key (step 4) to enable AI features. |

---

## Verify it's healthy (optional)

While the bot is running, open a new Terminal tab and run:

```bash
curl http://127.0.0.1:3000/healthz
```

A healthy bot replies with `{"ok":true,...}`.

---

That's it. For the full command list and features, see [README.md](README.md).
```
