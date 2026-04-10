import { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS_PROXY = "https://api.allorigins.win/get?url=";
const IMG_BASE   = "https://gen.pollinations.ai/image/";
const AUTH_BASE  = "https://enter.pollinations.ai/authorize";
const USERINFO   = "https://enter.pollinations.ai/api/device/userinfo";
const APP_KEY    = "pk_sceneweave"; // your publishable key — safe to be public

// ── AI provider detection ─────────────────────────────────────────────────────

function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith("sk-ant-"))      return "anthropic";
  if (key.startsWith("AIza"))         return "gemini";
  if (key.startsWith("xai-"))         return "openai-compat"; // Grok
  if (key.startsWith("sk-or-"))       return "openai-compat"; // OpenRouter
  if (key.startsWith("sk-"))          return "openai-compat"; // OpenAI
  return "openai-compat"; // assume OpenAI-compatible for anything else
}

const PROVIDER_ENDPOINTS = {
  "anthropic":     "https://api.anthropic.com/v1/messages",
  "gemini":        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  "openai-compat": "https://api.openai.com/v1/chat/completions",
};

const PROVIDER_LABELS = {
  "anthropic":     "Claude",
  "gemini":        "Gemini",
  "openai-compat": "OpenAI-compatible",
};

const SYSTEM_PROMPT = `You are a cinematographer writing image prompts for a visual novel.
Given a fiction passage, write one atmospheric image prompt.
Focus on: setting, lighting, time of day, textures, colour palette, mood.
For intimate scenes describe the environment — candlelight, sheets, ambient light — not the acts.
Return ONLY the prompt. Max 60 words. Style: photorealistic, cinematic, dramatic lighting.`;

async function buildPrompt(sceneText, meta, aiKey) {
  const provider = detectProvider(aiKey);
  const excerpt  = sceneText.slice(0, 700);
  const userMsg  = `"${meta.title}" (${meta.fandom || "fiction"})\n\n${excerpt}`;

  if (provider === "anthropic") {
    const res  = await fetch(PROVIDER_ENDPOINTS.anthropic, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": aiKey,
                 "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 120,
        system: SYSTEM_PROMPT, messages: [{ role: "user", content: userMsg }] }),
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.content?.[0]?.text ?? "";
  }

  if (provider === "gemini") {
    const res = await fetch(`${PROVIDER_ENDPOINTS.gemini}?key=${aiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [
        { text: SYSTEM_PROMPT + "\n\n" + userMsg }
      ]}], generationConfig: { maxOutputTokens: 120 } }),
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // OpenAI-compatible (OpenAI, Grok, OpenRouter, etc.)
  const res = await fetch(PROVIDER_ENDPOINTS["openai-compat"], {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiKey}` },
    body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 120,
      messages: [{ role: "system", content: SYSTEM_PROMPT },
                 { role: "user",   content: userMsg }] }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content ?? "";
}

// ── Fallback prompt — unique per scene without AI key ─────────────────────────

function fallbackPrompt(sceneText, meta, idx) {
  // Extract a handful of concrete nouns/adjectives from the scene text
  const stopWords = new Set(["the","a","an","and","or","but","in","on","at","to","of",
    "was","were","had","has","is","it","he","she","they","his","her","their","with",
    "that","this","from","as","be","been","have","not","for","by","are","said","could"]);
  const words = sceneText.toLowerCase().replace(/[^a-z\s]/g,"").split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w));
  const unique = [...new Set(words)].slice(0, 6).join(", ");
  const fandom = meta.fandom || meta.title || "fiction";
  return `cinematic scene, ${fandom}, ${unique}, dramatic lighting, photorealistic, atmospheric`;
}

// ── Story fetching ─────────────────────────────────────────────────────────────

function isUrl(str) {
  return /^https?:\/\/.+/i.test(str.trim());
}

function parseAO3(html) {
  const doc    = new DOMParser().parseFromString(html, "text/html");
  const title  = doc.querySelector("h2.title")?.textContent?.trim() ?? "Untitled";
  const author = doc.querySelector("a[rel=author]")?.textContent?.trim() ?? "Anonymous";
  const fandom = [...doc.querySelectorAll(".fandom.tags a")]
    .map(a => a.textContent.trim()).join(", ") || "";
  let text = "";
  doc.querySelectorAll(".userstuff").forEach(ch => {
    ch.querySelectorAll(".notes,.end.notes,.endnotes").forEach(n => n.remove());
    text += ch.textContent + "\n\n";
  });
  if (!text.trim()) text = doc.querySelector("#chapters")?.textContent ?? "";
  return { title, author, fandom, text: text.trim() };
}

function parseGeneric(html, url) {
  const doc  = new DOMParser().parseFromString(html, "text/html");
  // Remove nav, header, footer, aside, script, style
  ["nav","header","footer","aside","script","style","noscript"].forEach(tag =>
    doc.querySelectorAll(tag).forEach(el => el.remove()));
  const title  = doc.querySelector("h1")?.textContent?.trim()
              ?? doc.title?.trim() ?? new URL(url).hostname;
  // Grab all paragraphs with meaningful content
  const paras  = [...doc.querySelectorAll("p")]
    .map(p => p.textContent.trim()).filter(p => p.length > 60);
  const text   = paras.join("\n\n");
  return { title, author: "", fandom: "", text };
}

async function fetchStory(rawUrl, setLoadMsg) {
  let url = rawUrl.trim();
  const isAO3 = url.includes("archiveofourown.org");
  if (isAO3 && !url.includes("view_adult"))
    url += (url.includes("?") ? "&" : "?") + "view_adult=true&view_full_work=true";

  setLoadMsg("Fetching story…");
  const res = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error("Could not fetch that URL — try pasting the text instead");
  const json = await res.json();
  const html = json.contents ?? json;

  setLoadMsg("Parsing…");
  return isAO3 ? parseAO3(html) : parseGeneric(html, url);
}

// ── Scene splitting ───────────────────────────────────────────────────────────

function splitScenes(text, targetWords = 270) {
  const paras  = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
  const scenes = [];
  let cur = [], wc = 0;
  for (const p of paras) {
    cur.push(p);
    wc += p.split(/\s+/).length;
    if (wc >= targetWords) { scenes.push(cur.join("\n\n")); cur = []; wc = 0; }
  }
  if (cur.length) scenes.push(cur.join("\n\n"));
  return scenes;
}

// ── Image URL ─────────────────────────────────────────────────────────────────

function makeImgUrl(prompt, seed, pollKey) {
  const encoded = encodeURIComponent(prompt.slice(0, 300));
  let url = `${IMG_BASE}${encoded}?width=1024&height=576&seed=${seed}&model=flux&nologo=true`;
  if (pollKey) url += `&key=${encodeURIComponent(pollKey)}`;
  return url;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
body, html { height: 100%; background: #1a1a1a; }

/* Setup scrollable */
.setup-scroll { overflow-y: auto; min-height: 100vh;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
.setup-scroll::-webkit-scrollbar { width: 4px; }
.setup-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

/* Reader */
.vn-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(130,50,50,0.3) transparent; }
.vn-scroll::-webkit-scrollbar { width: 3px; }
.vn-scroll::-webkit-scrollbar-thumb { background: rgba(130,50,50,0.4); border-radius: 2px; }

@keyframes flicker  { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes fadeIn   { from{opacity:0} to{opacity:1} }
@keyframes slideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes spinDot  { to{transform:rotate(360deg)} }
@keyframes stageIn  { from{opacity:0} to{opacity:1} }

.scene-img   { animation: fadeIn 0.9s ease; }
.para-in     { animation: slideUp 0.35s ease both; }
.loading-spin{ animation: spinDot 1.4s linear infinite; }
.staging     { animation: stageIn 0.15s ease; }

/* Setup inputs */
.sw-input {
  width: 100%; background: #2a2a2a; border: 1px solid #3a3a3a;
  color: #e8e8e8; font-family: 'Inter', sans-serif; font-size: 0.9rem;
  font-weight: 300; padding: 10px 14px; outline: none; border-radius: 6px;
  transition: border-color 0.15s;
}
.sw-input:focus { border-color: #555; }
.sw-input::placeholder { color: #555; }
.sw-textarea { resize: vertical; min-height: 140px; line-height: 1.6; }
.sw-btn-primary {
  width: 100%; padding: 12px; background: #e8e8e8; border: none;
  color: #111; font-family: 'Inter', sans-serif; font-size: 0.9rem;
  font-weight: 500; cursor: pointer; border-radius: 6px; transition: background 0.15s;
}
.sw-btn-primary:hover { background: #fff; }
.sw-btn-primary:disabled { background: #333; color: #666; cursor: default; }
.sw-btn-secondary {
  width: 100%; padding: 10px; background: transparent;
  border: 1px solid #3a3a3a; color: #aaa;
  font-family: 'Inter', sans-serif; font-size: 0.85rem; font-weight: 400;
  cursor: pointer; border-radius: 6px; transition: all 0.15s;
}
.sw-btn-secondary:hover { border-color: #555; color: #e8e8e8; }
`;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  // Reader (unchanged dramatic aesthetic)
  reader: { height: "100vh", display: "flex", flexDirection: "column",
    background: "#080508", fontFamily: "'Cormorant Garamond', serif", overflow: "hidden" },
  imgArea: { flex: "0 0 58%", position: "relative", overflow: "hidden", background: "#100810" },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  imgPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center",
    justifyContent: "center", background: "linear-gradient(135deg,#100810,#180b14)" },
  placeholderText: { color: "rgba(140,80,80,0.6)", fontStyle: "italic", fontSize: "0.9rem",
    animation: "flicker 2s ease-in-out infinite" },
  imgFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: "45%",
    background: "linear-gradient(to top, rgba(8,5,8,1) 0%, rgba(8,5,8,0.6) 50%, transparent 100%)",
    pointerEvents: "none" },
  topBar: { position: "absolute", top: 14, left: 18, right: 18,
    display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none" },
  storyTitleBar: { fontFamily: "'Playfair Display',serif", fontStyle: "italic",
    fontSize: "0.8rem", color: "rgba(234,221,208,0.6)", textShadow: "0 1px 6px rgba(0,0,0,0.9)",
    pointerEvents: "none" },
  backBtn: { background: "rgba(8,5,8,0.7)", border: "1px solid rgba(200,200,200,0.2)",
    color: "rgba(220,220,220,0.8)", fontSize: "0.72rem", padding: "5px 14px",
    cursor: "pointer", letterSpacing: "0.06em", fontFamily: "'Inter',sans-serif",
    pointerEvents: "all", borderRadius: 4, transition: "all 0.2s" },
  sceneNum: { position: "absolute", bottom: 50, right: 18,
    fontSize: "0.65rem", color: "rgba(140,100,80,0.55)", letterSpacing: "0.18em", textTransform: "uppercase" },
  textPanel: { flex: 1, position: "relative", overflow: "hidden", padding: "20px 30px 14px",
    background: "linear-gradient(to bottom,#0c0809,#080508)",
    borderTop: "1px solid rgba(120,40,40,0.2)" },
  panelRule: { position: "absolute", top: 0, left: 50, right: 50, height: 1,
    background: "linear-gradient(90deg,transparent,rgba(139,48,48,0.45),transparent)" },
  textScroll: { height: "calc(100% - 38px)" },
  para: { fontSize: "1.08rem", lineHeight: 1.72, color: "#cdb8a8", marginBottom: "0.75em", letterSpacing: "0.01em" },
  navRow: { position: "absolute", bottom: 12, left: 28, right: 28,
    display: "flex", alignItems: "center", gap: 14 },
  navBtn: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    color: "#ddd", fontFamily: "'Inter',sans-serif", fontSize: "0.82rem",
    padding: "5px 18px", cursor: "pointer", borderRadius: 4, transition: "all 0.15s", whiteSpace: "nowrap" },
  prog: { flex: 1, height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1 },
  progFill: { height: "100%", background: "rgba(255,255,255,0.35)", transition: "width 0.4s ease", borderRadius: 1 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,      setScreen]      = useState("setup");
  const [storyText,   setStoryText]   = useState("");
  const [storyUrl,    setStoryUrl]    = useState("");
  const [aiKey,       setAiKey]       = useState(() => localStorage.getItem("sw_ai_key") || "");
  const [pollKey,     setPollKey]     = useState(() => localStorage.getItem("sw_poll_key") || "");
  const [pollUser,    setPollUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem("sw_poll_user") || "null"); } catch { return null; }
  });
  const [meta,        setMeta]        = useState({});
  const [scenes,      setScenes]      = useState([]);
  const [imgData,     setImgData]     = useState({});
  const [cur,         setCur]         = useState(0);
  const [loadMsg,     setLoadMsg]     = useState("");
  const [err,         setErr]         = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const pending    = useRef(new Set());
  const scenesRef  = useRef([]);
  const metaRef    = useRef({});
  const aiKeyRef   = useRef("");
  const pollKeyRef = useRef("");
  const imgDataRef = useRef({});

  scenesRef.current  = scenes;
  metaRef.current    = meta;
  aiKeyRef.current   = aiKey;
  pollKeyRef.current = pollKey;
  imgDataRef.current = imgData;

  // Persist
  useEffect(() => { localStorage.setItem("sw_ai_key",   aiKey);   }, [aiKey]);
  useEffect(() => { localStorage.setItem("sw_poll_key", pollKey); }, [pollKey]);

  // OAuth redirect handler
  useEffect(() => {
    const hash    = new URLSearchParams(location.hash.slice(1));
    const returned = hash.get("api_key");
    if (returned) {
      setPollKey(returned);
      localStorage.setItem("sw_poll_key", returned);
      history.replaceState(null, "", location.pathname);
      fetch(USERINFO, { headers: { Authorization: `Bearer ${returned}` } })
        .then(r => r.json())
        .then(u => { setPollUser(u); localStorage.setItem("sw_poll_user", JSON.stringify(u)); })
        .catch(() => {});
    }
  }, []);

  const signInWithPollinations = () => {
    const params = new URLSearchParams({ redirect_url: location.href.split("#")[0], app_key: APP_KEY });
    window.location.href = `${AUTH_BASE}?${params}`;
  };

  const signOut = () => {
    setPollKey(""); setPollUser(null);
    localStorage.removeItem("sw_poll_key"); localStorage.removeItem("sw_poll_user");
  };

  // ── Image generation ────────────────────────────────────────────────────────

  const patchImg = (idx, patch) =>
    setImgData(prev => ({ ...prev, [idx]: { ...(prev[idx] ?? {}), ...patch } }));

  const genImage = async (idx) => {
    const sc = scenesRef.current;
    if (!sc[idx] || pending.current.has(idx)) return;
    pending.current.add(idx);
    patchImg(idx, { loading: true });
    try {
      const key = aiKeyRef.current;
      const prompt = key
        ? (await buildPrompt(sc[idx], metaRef.current, key)).trim()
        : fallbackPrompt(sc[idx], metaRef.current, idx);
      patchImg(idx, { loading: false, url: makeImgUrl(prompt, idx * 8317, pollKeyRef.current), prompt });
    } catch (e) {
      console.error("Image gen error:", e);
      pending.current.delete(idx);
      patchImg(idx, { loading: false, error: true });
    }
  };

  useEffect(() => {
    if (screen !== "reader") return;
    genImage(cur);
    if (cur + 1 < scenesRef.current.length) genImage(cur + 1);
    if (cur + 2 < scenesRef.current.length) genImage(cur + 2);
  }, [cur, screen]);

  // Auto-dismiss staging
  useEffect(() => {
    if (!transitioning) return;
    const img = imgData[cur];
    if (img?.url || img?.error) setTransitioning(false);
  }, [imgData, cur, transitioning]);

  // Keyboard nav
  useEffect(() => {
    if (screen !== "reader") return;
    const h = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); navigate(1); }
      if (e.key === "ArrowLeft")                    { e.preventDefault(); navigate(-1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen]);

  const navigate = (delta) => {
    const next = cur + delta;
    if (next < 0 || next >= scenesRef.current.length) return;
    const nextImg = imgDataRef.current[next];
    if (nextImg?.url) { setCur(next); }
    else { setTransitioning(true); genImage(next); setCur(next); }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const submit = async () => {
    setErr("");
    const hasUrl  = isUrl(storyUrl);
    const hasText = storyText.trim().length > 100;
    if (!hasUrl && !hasText) { setErr("Paste some story text or enter a URL above."); return; }

    setScreen("loading");
    try {
      let parsed;
      if (hasUrl) {
        parsed = await fetchStory(storyUrl, setLoadMsg);
        // If URL fetch returned very little text, fall back to pasted text
        if (parsed.text.length < 200 && hasText) {
          parsed = { title: "Story", author: "", fandom: "", text: storyText.trim() };
        }
      } else {
        setLoadMsg("Processing…");
        parsed = { title: "Story", author: "", fandom: "", text: storyText.trim() };
      }

      if (!parsed.text) throw new Error("No story text found — try pasting the text directly.");

      setLoadMsg("Splitting into scenes…");
      const sceneList = splitScenes(parsed.text);
      if (!sceneList.length) throw new Error("No scenes found.");

      pending.current.clear();
      setMeta({ title: parsed.title, author: parsed.author, fandom: parsed.fandom });
      setScenes(sceneList);
      setImgData({});
      setCur(0);
      setScreen("reader");
    } catch (e) {
      setErr(e.message);
      setScreen("setup");
    }
  };

  const provider    = detectProvider(aiKey);
  const providerLabel = provider ? PROVIDER_LABELS[provider] : null;
  const cd          = imgData[cur] ?? {};
  const progress    = scenes.length ? ((cur + 1) / scenes.length) * 100 : 0;
  const canSubmit   = isUrl(storyUrl) || storyText.trim().length > 100;

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (screen === "setup") return (
    <div className="setup-scroll">
      <style>{CSS}</style>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 24px 64px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.9rem",
            fontWeight: 400, color: "#e8e8e8", marginBottom: 6 }}>SceneWeave</h1>
          <p style={{ color: "#666", fontSize: "0.82rem", letterSpacing: "0.04em" }}>
            Turn any story into a visual novel
          </p>
        </div>

        {/* Pollinations login — front and centre */}
        <div style={{ marginBottom: 32, padding: "16px 18px", background: "#222",
          border: "1px solid #333", borderRadius: 8 }}>
          {pollUser ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {pollUser.picture && <img src={pollUser.picture} alt=""
                  style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />}
                <div>
                  <p style={{ color: "#e8e8e8", fontSize: "0.88rem", fontFamily: "'Inter',sans-serif" }}>
                    {pollUser.name || pollUser.preferred_username}
                  </p>
                  <p style={{ color: "#4a9", fontSize: "0.72rem", fontFamily: "'Inter',sans-serif" }}>
                    Pollinations connected
                  </p>
                </div>
              </div>
              <button onClick={signOut} style={{ background: "none", border: "none",
                color: "#666", fontSize: "0.75rem", cursor: "pointer",
                fontFamily: "'Inter',sans-serif" }}>sign out</button>
            </div>
          ) : (
            <div>
              <button className="sw-btn-secondary" onClick={signInWithPollinations}
                style={{ marginBottom: 8 }}>
                Sign in with Pollinations
              </button>
              <p style={{ color: "#555", fontSize: "0.72rem", fontFamily: "'Inter',sans-serif",
                textAlign: "center", lineHeight: 1.5 }}>
                Use your own pollen credits for image generation.<br />
                Works without sign-in, but limits apply.
              </p>
            </div>
          )}
        </div>

        {/* Story text — primary input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#999", fontSize: "0.72rem",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
            fontFamily: "'Inter',sans-serif" }}>
            Story text
          </label>
          <textarea className="sw-input sw-textarea"
            placeholder="Paste your story here…"
            value={storyText} onChange={e => setStoryText(e.target.value)} />
        </div>

        {/* URL — secondary */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#999", fontSize: "0.72rem",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
            fontFamily: "'Inter',sans-serif" }}>
            Or story URL
            <span style={{ color: "#555", textTransform: "none", letterSpacing: 0,
              marginLeft: 8, fontSize: "0.7rem" }}>
              AO3, most story sites — text above takes priority
            </span>
          </label>
          <input className="sw-input" type="url"
            placeholder="https://archiveofourown.org/works/…"
            value={storyUrl} onChange={e => setStoryUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        {/* AI key — optional, provider-detecting */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: "block", color: "#999", fontSize: "0.72rem",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
            fontFamily: "'Inter',sans-serif" }}>
            AI key for smarter prompts
            <span style={{ color: "#555", textTransform: "none", letterSpacing: 0,
              marginLeft: 8, fontSize: "0.7rem" }}>optional</span>
          </label>
          <input className="sw-input" type="password"
            placeholder="sk-ant-… / sk-… / AIza… / xai-… (any major provider)"
            value={aiKey} onChange={e => setAiKey(e.target.value)} />
          {providerLabel && (
            <p style={{ color: "#4a9", fontSize: "0.72rem", marginTop: 5,
              fontFamily: "'Inter',sans-serif" }}>✓ {providerLabel} detected</p>
          )}
        </div>

        {err && <p style={{ color: "#e05", fontSize: "0.82rem", marginBottom: 16,
          fontFamily: "'Inter',sans-serif", background: "rgba(220,0,80,0.08)",
          padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(220,0,80,0.2)" }}>{err}</p>}

        <button className="sw-btn-primary" onClick={submit} disabled={!canSubmit}>
          Begin Reading
        </button>

        <p style={{ color: "#444", fontSize: "0.7rem", textAlign: "center",
          marginTop: 16, fontFamily: "'Inter',sans-serif" }}>
          ← → or Space to navigate · Images by Pollinations FLUX
        </p>
      </div>
    </div>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "#1a1a1a", fontFamily: "'Inter',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ width: 32, height: 32, borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.6)" }}
        className="loading-spin" />
      <p style={{ color: "#999", fontSize: "0.8rem", letterSpacing: "0.1em" }}>{loadMsg}</p>
    </div>
  );

  // ── Staging ─────────────────────────────────────────────────────────────────
  if (screen === "reader" && transitioning) return (
    <div className="staging" style={{ height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20,
      background: "#080508", fontFamily: "'Cormorant Garamond',serif" }}>
      <style>{CSS}</style>
      <div style={{ width: 36, height: 36, borderRadius: "50%",
        border: "1.5px solid rgba(139,50,50,0.2)", borderTopColor: "#8b3030" }}
        className="loading-spin" />
      <p style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic",
        fontSize: "1.1rem", color: "rgba(234,221,208,0.5)" }}>{meta.title}</p>
      <p style={{ fontSize: "0.65rem", color: "rgba(139,80,80,0.4)",
        letterSpacing: "0.2em", textTransform: "uppercase" }}>Painting the scene…</p>
    </div>
  );

  // ── Reader ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.reader}>
      <style>{CSS}</style>

      <div style={S.imgArea}>
        {cd.url
          ? <img src={cd.url} style={S.img} alt="Scene" className="scene-img"
              onError={() => patchImg(cur, { url: null, error: true })} />
          : <div style={S.imgPlaceholder}>
              <p style={S.placeholderText}>
                {cd.loading ? "Painting the scene…" : cd.error ? "Image unavailable" : "Awaiting generation…"}
              </p>
            </div>
        }
        <div style={S.imgFade} />

        <div style={S.topBar}>
          <span style={S.storyTitleBar}>
            {meta.title}{meta.author ? ` · ${meta.author}` : ""}{meta.fandom ? ` · ${meta.fandom}` : ""}
          </span>
          <button style={S.backBtn}
            onMouseEnter={e => e.target.style.color = "#fff"}
            onMouseLeave={e => e.target.style.color = "rgba(220,220,220,0.8)"}
            onClick={() => setScreen("setup")}>
            ← New Story
          </button>
        </div>

        <div style={S.sceneNum}>{cur + 1} / {scenes.length}</div>
      </div>

      <div style={S.textPanel}>
        <div style={S.panelRule} />
        <div style={S.textScroll} className="vn-scroll">
          {scenes[cur]?.split("\n\n").map((p, i) => (
            <p key={`${cur}-${i}`} style={{ ...S.para, animationDelay: `${i * 40}ms` }}
              className="para-in">{p}</p>
          ))}
        </div>

        <div style={S.navRow}>
          <button style={{ ...S.navBtn, opacity: cur === 0 ? 0.3 : 1 }}
            disabled={cur === 0}
            onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.06)"}
            onClick={() => navigate(-1)}>‹ Prev</button>

          <div style={S.prog}><div style={{ ...S.progFill, width: `${progress}%` }} /></div>

          <button style={{ ...S.navBtn, opacity: cur >= scenes.length - 1 ? 0.3 : 1 }}
            disabled={cur >= scenes.length - 1}
            onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.06)"}
            onClick={() => navigate(1)}>Next ›</button>
        </div>
      </div>
    </div>
  );
}
