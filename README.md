# SceneWeave

A cinematic visual novel reader that transforms AO3 fanfiction into an illustrated experience — powered by Pollinations FLUX for scene imagery and Claude for atmospheric prompt generation.

## Features

- Paste any AO3 URL and read it as a visual novel
- AI-generated scene illustrations via Pollinations FLUX
- Smart cinematic scene prompts via Claude API (optional — falls back gracefully without a key)
- Keyboard navigation (← → or Space)
- Preloads the next scene image in the background for seamless transitions

---

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploy to Vercel (recommended, free)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import `scene-weave`
3. Leave all settings as default — Vercel auto-detects Vite
4. Click Deploy

Your app will be live at `scene-weave.vercel.app` (or similar) in about 60 seconds.

## Deploy to GitHub Pages (alternative)

1. Install the Pages plugin: `npm install -D gh-pages`
2. Add to `package.json` scripts: `"deploy": "gh-pages -d dist"`
3. Add `base: '/scene-weave/'` to `vite.config.js`
4. Run: `npm run build && npm run deploy`

---

## Earn Pollen credits from Pollinations

Once deployed, submit your app to earn daily Pollen credits:

### Step 1 — Register your domain

Go to [enter.pollinations.ai](https://enter.pollinations.ai), log in with GitHub, and register your deployed domain (e.g. `scene-weave.vercel.app`). This puts you on the **Seed** tier and starts your daily credit grants.

### Step 2 — Star the Pollinations GitHub repo

Go to [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations) and star it. This counts as a one-time community reward for Pollen.

### Step 3 — Submit to the community showcase

Open a GitHub Issue on the Pollinations repo using their app submission template, or open a PR adding your app to `apps/APPS.md`. Include:
- App name and description
- Your deployed URL (`scene-weave.vercel.app`)
- Screenshot

Apps accepted to the showcase are featured on [pollinations.ai/apps](https://pollinations.ai/apps) and can be eligible for **Flower** or **Nectar** tier upgrades, which give significantly higher daily grants.

### Step 4 — Join their Discord

discord.gg/pollinations — community members can manually upgrade your tier, and there are occasional Pollen bounties for fixing issues or building features.

---

## Tech stack

- React 18 + Vite
- [Pollinations FLUX](https://pollinations.ai) — image generation
- Anthropic Claude API — scene prompt generation (optional)
- allorigins.win — CORS proxy for AO3 fetching

## License

MIT
