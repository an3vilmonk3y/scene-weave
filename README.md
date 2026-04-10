# Fic to Visual Novel

A cinematic visual novel reader that converts AO3 fanfiction into an illustrated experience, using Pollinations FLUX for scene images and Claude for atmospheric prompt generation.

## Features

- Paste an AO3 URL and read any work as a visual novel
- AI-generated scene illustrations via Pollinations FLUX
- Smart scene prompts via Claude API (optional)
- Keyboard navigation (← → or Space)
- Falls back gracefully without an API key

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
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Leave all settings as default — Vercel auto-detects Vite
4. Click Deploy

Your app will be live at `your-project.vercel.app` in about 60 seconds.

## Deploy to GitHub Pages (alternative)

1. Install the Pages plugin: `npm install -D gh-pages`
2. Add to `package.json` scripts: `"deploy": "gh-pages -d dist"`
3. Add `base: '/your-repo-name/'` to `vite.config.js`
4. Run: `npm run build && npm run deploy`

---

## Tech stack

- React 18 + Vite
- [Pollinations FLUX](https://pollinations.ai) — image generation
- Anthropic Claude API — scene prompt generation (optional)
- allorigins.win — CORS proxy for AO3 fetching

## License

MIT
