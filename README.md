# SceneWeave

A cinematic visual novel reader that transforms AO3 fanfiction into an illustrated experience — powered by Pollinations FLUX for scene imagery and (optionally) Claude for smarter atmospheric prompts.

## Features

- Paste any AO3 URL and read it as a visual novel
- AI-generated scene illustrations via Pollinations FLUX
- Keyboard navigation (← → or Space)
- Seamless scene transitions with background preloading
- Bring your own Pollinations key (BYOP) for higher image generation limits
- Optional Claude API key for smarter, story-aware scene prompts

## Usage

Just visit the app, paste an AO3 URL or story text, and hit **Begin Reading**. No account or API key required to get started.

**Optional keys (entered on the start screen):**
- **Pollinations key** (`pk_…`) — get one free at [enter.pollinations.ai](https://enter.pollinations.ai). Increases your image generation rate limits.
- **Anthropic key** (`sk-ant-…`) — uses Claude to write cinematic scene prompts tailored to your story, rather than a generic fallback.

---

## Self-hosting / development

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Deploy to Vercel (free)

1. Fork this repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your fork
3. Leave all settings as default — Vercel auto-detects Vite
4. Click Deploy

---

## Tech stack

- React 18 + Vite
- [Pollinations FLUX](https://pollinations.ai) — image generation
- Anthropic Claude API — scene prompt generation (optional)
- allorigins.win — CORS proxy for AO3 fetching

## License

MIT
