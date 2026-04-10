import { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS_PROXY = "https://api.allorigins.win/get?url=";
const IMG_BASE = "https://gen.pollinations.ai/image/";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAO3(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title  = doc.querySelector("h2.title")?.textContent?.trim() ?? "Untitled";
  const author = doc.querySelector("a[rel=author]")?.textContent?.trim() ?? "Anonymous";
  const fandom = [...doc.querySelectorAll(".fandom.tags a")]
    .map(a => a.textContent.trim()).join(", ") || "";

  let text = "";
  const chapters = doc.querySelectorAll(".userstuff");
  chapters.forEach(ch => {
    ch.querySelectorAll(".notes, .end.notes, .endnotes").forEach(n => n.remove());
    text += ch.textContent + "\n\n";
  });
  if (!text.trim()) {
    const single = doc.querySelector("#chapters");
    if (single) text = single.textContent;
  }
  return { title, author, fandom, text: text.trim() };
}

function splitScenes(text, targetWords = 270) {
  const paras = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
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

async function buildPrompt(sceneText, meta, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      system: `You are a cinematographer creating image prompts for a visual novel.
Given a passage of fiction, write a single atmospheric image prompt.
Focus on: setting, lighting, time of day, textures, colour palette, mood.
For intimate scenes describe the environment — bedroom details, candlelight, sheets, ambient light — rather than depicting acts.
Return ONLY the prompt. Max 70 words. Style: photorealistic, cinematic, dramatic lighting.`,
      messages: [{
        role: "user",
        content: `"${meta.title}" by ${meta.author} (${meta.fandom})\n\n${sceneText.slice(0, 700)}`
      }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text ?? "cinematic interior, moody light, photorealistic";
}

function makeImgUrl(prompt, seed, key) {
  const encoded = encodeURIComponent(prompt.slice(0, 300));
  let url = `${IMG_BASE}${encoded}?width=1024&height=576&seed=${seed}&model=flux&nologo=true`;
  if (key) url += `&key=${encodeURIComponent(key)}`;
  return url;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
body, html { height: 100%; overflow: hidden; background: #080508; }

.vn-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(130,50,50,0.3) transparent; }
.vn-scroll::-webkit-scrollbar { width: 3px; }
.vn-scroll::-webkit-scrollbar-thumb { background: rgba(130,50,50,0.4); border-radius: 2px; }

@keyframes flicker { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes fadeIn  { from{opacity:0} to{opacity:1} }
@keyframes fadeOut { from{opacity:1} to{opacity:0} }
@keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
@keyframes spinDot { to{transform:rotate(360deg)} }
@keyframes stageIn { from{opacity:0} to{opacity:1} }

.scene-img { animation: fadeIn 0.9s ease; }
.para-in   { animation: slideUp 0.4s ease both; }
.loading-spin { animation: spinDot 1.4s linear infinite; }
.staging   { animation: stageIn 0.15s ease; }
`;

const S = {
  // Setup
  setup: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(ellipse at 50% 40%, #1c0a12 0%, #080508 65%)",
    fontFamily: "'Cormorant Garamond', serif",
  },
  card: {
    width: 500, padding: "48px 44px", position: "relative",
    background: "rgba(12,6,10,0.97)",
    border: "1px solid rgba(160,70,70,0.25)",
    boxShadow: "0 0 80px rgba(140,40,40,0.12)",
  },
  topRule: {
    position: "absolute", top: 0, left: 44, right: 44, height: 1,
    background: "linear-gradient(90deg, transparent, rgba(160,70,70,0.6), transparent)",
  },
  h1: {
    fontFamily: "'Playfair Display', serif", fontSize: "2.1rem", fontWeight: 400,
    color: "#eaddd0", letterSpacing: "0.04em", marginBottom: 4,
  },
  sub: {
    fontSize: "0.72rem", color: "#7a5a50", letterSpacing: "0.2em",
    textTransform: "uppercase", marginBottom: 32,
  },
  tabs: { display: "flex", borderBottom: "1px solid rgba(140,60,60,0.25)", marginBottom: 24 },
  tab: {
    flex: 1, padding: "8px 0", background: "none", border: "none",
    color: "#6a4a40", fontFamily: "'Cormorant Garamond', serif", fontSize: "0.95rem",
    cursor: "pointer", letterSpacing: "0.08em", borderBottom: "2px solid transparent",
    marginBottom: -1, transition: "all 0.2s",
  },
  tabActive: { color: "#eaddd0", borderBottomColor: "#8b3030" },
  label: {
    display: "block", fontSize: "0.68rem", color: "#7a5a50",
    letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8, marginTop: 20,
  },
  input: {
    width: "100%", background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(140,100,90,0.2)", color: "#eaddd0",
    fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem",
    padding: "11px 14px", outline: "none",
  },
  btn: {
    width: "100%", marginTop: 28, padding: 14,
    background: "linear-gradient(135deg, #8b2e2e, #651f1f)",
    border: "none", color: "#f0e2d4",
    fontFamily: "'Playfair Display', serif", fontSize: "1rem",
    letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.2s",
  },
  hint: {
    marginTop: 16, fontSize: "0.68rem", color: "rgba(130,90,80,0.5)",
    textAlign: "center", letterSpacing: "0.1em",
  },
  errMsg: { color: "#c06060", fontSize: "0.85rem", marginTop: 12, textAlign: "center" },

  // Loading
  loadScreen: {
    height: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 16,
    background: "#080508", fontFamily: "'Cormorant Garamond', serif",
  },
  loadDot: {
    width: 32, height: 32, borderRadius: "50%",
    border: "2px solid rgba(139,50,50,0.2)",
    borderTopColor: "#8b3030",
  },
  loadTitle: { fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#eaddd0" },
  loadMsg: { fontSize: "0.75rem", color: "#7a5a50", letterSpacing: "0.15em", textTransform: "uppercase" },

  // Reader
  reader: {
    height: "100vh", display: "flex", flexDirection: "column",
    background: "#080508", fontFamily: "'Cormorant Garamond', serif",
  },
  imgArea: { flex: "0 0 58%", position: "relative", overflow: "hidden", background: "#100810" },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  imgPlaceholder: {
    width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #100810, #180b14)",
  },
  placeholderText: { color: "rgba(140,80,80,0.6)", fontStyle: "italic", fontSize: "0.9rem", animation: "flicker 2s ease-in-out infinite" },
  imgFade: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "45%",
    background: "linear-gradient(to top, rgba(8,5,8,1) 0%, rgba(8,5,8,0.6) 50%, transparent 100%)",
    pointerEvents: "none",
  },
  topBar: {
    position: "absolute", top: 14, left: 18, right: 18,
    display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none",
  },
  storyTitleBar: {
    fontFamily: "'Playfair Display', serif", fontStyle: "italic",
    fontSize: "0.8rem", color: "rgba(234,221,208,0.6)",
    textShadow: "0 1px 6px rgba(0,0,0,0.9)", pointerEvents: "none",
  },
  backBtn: {
    background: "rgba(8,5,8,0.6)", border: "1px solid rgba(140,70,70,0.25)",
    color: "rgba(140,100,90,0.7)", fontSize: "0.68rem", padding: "4px 12px",
    cursor: "pointer", letterSpacing: "0.1em", fontFamily: "'Cormorant Garamond', serif",
    pointerEvents: "all", transition: "all 0.2s",
  },
  sceneNum: {
    position: "absolute", bottom: 50, right: 18,
    fontSize: "0.65rem", color: "rgba(140,100,80,0.55)",
    letterSpacing: "0.18em", textTransform: "uppercase",
  },
  // Text panel
  textPanel: {
    flex: 1, position: "relative", overflow: "hidden",
    padding: "20px 30px 14px",
    background: "linear-gradient(to bottom, #0c0809, #080508)",
    borderTop: "1px solid rgba(120,40,40,0.2)",
  },
  panelRule: {
    position: "absolute", top: 0, left: 50, right: 50, height: 1,
    background: "linear-gradient(90deg, transparent, rgba(139,48,48,0.45), transparent)",
  },
  textScroll: { height: "calc(100% - 38px)" },
  para: {
    fontSize: "1.08rem", lineHeight: 1.72, color: "#cdb8a8",
    marginBottom: "0.75em", letterSpacing: "0.01em",
  },
  // Nav row
  navRow: {
    position: "absolute", bottom: 12, left: 28, right: 28,
    display: "flex", alignItems: "center", gap: 14,
  },
  navBtn: {
    background: "rgba(139,48,48,0.12)", border: "1px solid rgba(139,48,48,0.28)",
    color: "#eaddd0", fontFamily: "'Cormorant Garamond', serif", fontSize: "0.85rem",
    padding: "5px 18px", cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  prog: { flex: 1, height: 2, background: "rgba(139,48,48,0.15)" },
  progFill: { height: "100%", background: "linear-gradient(90deg, #5a1a1a, #8b3030)", transition: "width 0.4s ease" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,   setScreen]   = useState("setup");
  const [mode,     setMode]     = useState("url");
  const [url,      setUrl]      = useState("");
  const [paste,    setPaste]    = useState("");
  const [apiKey,   setApiKey]   = useState("");
  const [meta,     setMeta]     = useState({});
  const [scenes,   setScenes]   = useState([]);
  const [imgData,  setImgData]  = useState({});
  const [cur,      setCur]      = useState(0);
  const [loadMsg,  setLoadMsg]  = useState("");
  const [err,      setErr]      = useState("");
  const [pollKey, setPollKey]   = useState("");
  

  const pending    = useRef(new Set());
  const scenesRef  = useRef([]);
  const metaRef    = useRef({});
  const apiKeyRef  = useRef("");
  const pollKeyRef = useRef("");

  scenesRef.current  = scenes;
  metaRef.current    = meta;
  apiKeyRef.current  = apiKey;
  pollKeyRef.current = pollKey;

  const patchImg = (idx, patch) =>
    setImgData(prev => ({ ...prev, [idx]: { ...(prev[idx] ?? {}), ...patch } }));

  const genImage = async (idx) => {
    const sc = scenesRef.current;
    if (!sc[idx] || pending.current.has(idx)) return;
    pending.current.add(idx);
    patchImg(idx, { loading: true });

    try {
      const anthropicKey = apiKeyRef.current;
      const pk = pollKeyRef.current;
      let prompt;

      if (anthropicKey) {
        prompt = await buildPrompt(sc[idx], metaRef.current, anthropicKey);
      } else {
        prompt = `cinematic ${metaRef.current.fandom || "atmospheric scene"}, dramatic lighting, photorealistic`;
      }

      patchImg(idx, { loading: false, url: makeImgUrl(prompt, idx * 8317, pk), prompt });
    } catch (e) {
      console.error("Image gen error:", e);
      pending.current.delete(idx);
      patchImg(idx, { loading: false, error: true });
    }
  };

  const [transitioning, setTransitioning] = useState(false);
  const imgDataRef = useRef({});
  imgDataRef.current = imgData;

  const navigate = (delta) => {
    const next = cur + delta;
    if (next < 0 || next >= scenesRef.current.length) return;
    const nextImg = imgDataRef.current[next];
    if (nextImg?.url) {
      setCur(next);
    } else {
      setTransitioning(true);
      genImage(next);
      setCur(next);
    }
  };

  // Auto-dismiss staging when image arrives
  useEffect(() => {
    if (!transitioning) return;
    const img = imgData[cur];
    if (img?.url || img?.error) setTransitioning(false);
  }, [imgData, cur, transitioning]);

  // Preload on scene change
  useEffect(() => {
    if (screen !== "reader") return;
    genImage(cur);
    if (cur + 1 < scenesRef.current.length) genImage(cur + 1);
    if (cur + 2 < scenesRef.current.length) genImage(cur + 2);
  }, [cur, screen]);

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

  const submit = async () => {
    setErr("");
    setScreen("loading");
    try {
      let storyMeta = {}, text = "";

      if (mode === "paste") {
        setLoadMsg("Processing text…");
        storyMeta = { title: "Story", author: "Unknown", fandom: "" };
        text = paste;
      } else {
        setLoadMsg("Fetching from AO3…");
        let ao3url = url.trim();
        if (!ao3url.includes("view_adult"))
          ao3url += (ao3url.includes("?") ? "&" : "?") + "view_adult=true&view_full_work=true";

        const res = await fetch(CORS_PROXY + encodeURIComponent(ao3url));
        if (!res.ok) throw new Error("Fetch failed — check the URL, or try pasting the text instead");
        const json = await res.json();

        setLoadMsg("Parsing story…");
        const parsed = parseAO3(json.contents ?? json);
        storyMeta = { title: parsed.title, author: parsed.author, fandom: parsed.fandom };
        text = parsed.text;
        if (!text) throw new Error("Could not read story text — try pasting the text instead");
      }

      setLoadMsg("Splitting scenes…");
      const sceneList = splitScenes(text);
      if (!sceneList.length) throw new Error("No scenes found");

      pending.current.clear();
      setMeta(storyMeta);
      setScenes(sceneList);
      setImgData({});
      setCur(0);
      setScreen("reader");
    } catch (e) {
      setErr(e.message);
      setScreen("setup");
    }
  };

  const cd       = imgData[cur] ?? {};
  const progress = scenes.length ? ((cur + 1) / scenes.length) * 100 : 0;

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (screen === "setup") return (
    <div style={S.setup}>
      <style>{CSS}</style>
      <div style={S.card}>
        <div style={S.topRule} />
        <h1 style={S.h1}>SceneWeave</h1>
        <p style={S.sub}>AO3 → Cinematic Reader</p>

        <div style={S.tabs}>
          {[["url","AO3 URL"],["paste","Paste Text"]].map(([m, label]) => (
            <button key={m} style={{...S.tab, ...(mode === m ? S.tabActive : {})}} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>

        {mode === "url" ? (
          <>
            <label style={S.label}>Archive of Our Own URL</label>
            <input style={S.input} placeholder="https://archiveofourown.org/works/…"
              value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} />
          </>
        ) : (
          <>
            <label style={S.label}>Story Text</label>
            <textarea style={{...S.input, height: 130, resize: "vertical"}}
              placeholder="Paste the story text here…"
              value={paste} onChange={e => setPaste(e.target.value)} />
          </>
        )}

        <label style={S.label}>
          Anthropic API Key
          <span style={{color:"#604030",fontStyle:"italic",marginLeft:6,textTransform:"none",fontSize:"0.85em",letterSpacing:0}}>
            optional — for smarter scene prompts
          </span>
        </label>
        <input style={S.input} type="password" placeholder="sk-ant-…"
          value={apiKey} onChange={e => setApiKey(e.target.value)} />

        <label style={S.label}>
          Pollinations API Key
          <span style={{color:"#604030",fontStyle:"italic",marginLeft:6,textTransform:"none",fontSize:"0.85em",letterSpacing:0}}>
            optional — publishable key (pk_…) for higher limits
          </span>
        </label>
        <input style={S.input} type="password" placeholder="pk_…"
          value={pollKey} onChange={e => setPollKey(e.target.value)} />

        {err && <p style={S.errMsg}>{err}</p>}

        <button style={S.btn}
          onMouseEnter={e => { e.target.style.background = "linear-gradient(135deg,#a03838,#7a2828)"; e.target.style.boxShadow = "0 0 24px rgba(139,50,50,0.3)"; }}
          onMouseLeave={e => { e.target.style.background = "linear-gradient(135deg,#8b2e2e,#651f1f)"; e.target.style.boxShadow = "none"; }}
          onClick={submit}>
          Begin Reading
        </button>
        <p style={S.hint}>← → or Space to navigate · Images by Pollinations FLUX</p>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={S.loadScreen}>
      <style>{CSS}</style>
      <div style={S.loadDot} className="loading-spin" />
      <p style={S.loadTitle}>Opening the story…</p>
      <p style={S.loadMsg}>{loadMsg}</p>
    </div>
  );

  // ── Staging (waiting for next image) ──────────────────────────────────────
  if (screen === "reader" && transitioning) return (
    <div className="staging" style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20,
      background: "radial-gradient(ellipse at 50% 40%, #1c0a12 0%, #080508 70%)",
      fontFamily: "'Cormorant Garamond', serif",
    }}>
      <style>{CSS}</style>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        border: "1.5px solid rgba(139,50,50,0.2)",
        borderTopColor: "#8b3030",
      }} className="loading-spin" />
      <p style={{
        fontFamily: "'Playfair Display', serif", fontStyle: "italic",
        fontSize: "1.1rem", color: "rgba(234,221,208,0.5)", letterSpacing: "0.06em",
      }}>{meta.title}</p>
      <p style={{
        fontSize: "0.65rem", color: "rgba(139,80,80,0.4)",
        letterSpacing: "0.2em", textTransform: "uppercase",
      }}>Painting the scene…</p>
    </div>
  );

  // ── Reader ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.reader}>
      <style>{CSS}</style>

      {/* Scene image */}
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
            {meta.title}{meta.author && meta.author !== "Unknown" ? ` · ${meta.author}` : ""}
            {meta.fandom ? ` · ${meta.fandom}` : ""}
          </span>
          <button style={S.backBtn}
            onMouseEnter={e => { e.target.style.color = "#eaddd0"; e.target.style.borderColor = "rgba(140,70,70,0.5)"; }}
            onMouseLeave={e => { e.target.style.color = "rgba(140,100,90,0.7)"; e.target.style.borderColor = "rgba(140,70,70,0.25)"; }}
            onClick={() => setScreen("setup")}>
            ← New Story
          </button>
        </div>

        <div style={S.sceneNum}>{cur + 1} / {scenes.length}</div>
      </div>

      {/* Text panel */}
      <div style={S.textPanel}>
        <div style={S.panelRule} />
        <div style={S.textScroll} className="vn-scroll">
          {scenes[cur]?.split("\n\n").map((p, i) => (
            <p key={`${cur}-${i}`} style={{...S.para, animationDelay: `${i * 40}ms`}} className="para-in">{p}</p>
          ))}
        </div>

        <div style={S.navRow}>
          <button style={{...S.navBtn, opacity: cur === 0 ? 0.25 : 1}}
            disabled={cur === 0}
            onMouseEnter={e => e.target.style.background = "rgba(139,48,48,0.28)"}
            onMouseLeave={e => e.target.style.background = "rgba(139,48,48,0.12)"}
            onClick={() => navigate(-1)}>‹ Prev</button>

          <div style={S.prog}><div style={{...S.progFill, width: `${progress}%`}} /></div>

          <button style={{...S.navBtn, opacity: cur >= scenes.length - 1 ? 0.25 : 1}}
            disabled={cur >= scenes.length - 1}
            onMouseEnter={e => e.target.style.background = "rgba(139,48,48,0.28)"}
            onMouseLeave={e => e.target.style.background = "rgba(139,48,48,0.12)"}
            onClick={() => navigate(1)}>Next ›</button>
        </div>
      </div>
    </div>
  );
}
