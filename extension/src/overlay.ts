// Drawn into a time-wasting page by the background, with chrome.scripting. It must not use anything from
// outside this function: it is copied into the page on its own. It reads nothing from the page.
export interface Card { title: string; text: string; back: boolean; demo: boolean }

export function showCard(card: Card): void {
  document.getElementById("mirror-nudge-card")?.remove();
  const host = document.createElement("div");
  host.id = "mirror-nudge-card";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  const paused: HTMLMediaElement[] = [];
  for (const m of document.querySelectorAll<HTMLMediaElement>("video,audio")) if (!m.paused) { m.pause(); paused.push(m); }
  root.innerHTML = `<style>
    :host{all:initial}
    .back{position:fixed;inset:0;background:rgba(23,16,31,.72);backdrop-filter:blur(10px);display:grid;place-items:center;font:500 17px/1.4 system-ui,sans-serif;color:#17101f;animation:fade .25s ease-out}
    .card{width:min(520px,calc(100vw - 32px));background:#ffd447;padding:28px 26px 24px;box-shadow:12px 12px 0 #ff4a26;animation:pop .45s cubic-bezier(.34,1.56,.64,1)}
    .tag{font:800 13px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px}
    h1{margin:0 0 12px;font:900 clamp(34px,7vw,54px)/.92 Impact,"Arial Black",system-ui,sans-serif;text-transform:uppercase;letter-spacing:-.01em}
    p.text{margin:0 0 22px;font-size:18px}
    .buttons{display:grid;gap:10px}
    button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:15px 18px;font:800 17px/1.1 system-ui,sans-serif;box-shadow:inset 0 0 0 3px #17101f;color:#17101f;transition:transform .2s}
    button:hover{transform:scale(1.02)}button:focus-visible{outline:3px solid #2536e8;outline-offset:3px}
    button.main{background:#17101f;color:#fff;box-shadow:none}
    @keyframes pop{from{transform:scale(.6) rotate(-3deg);opacity:0}}@keyframes fade{from{opacity:0}}
    @media (prefers-reduced-motion:reduce){.back,.card{animation:none}}
  </style>
  <div class="back" role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="d">
    <div class="card"><p class="tag"></p><h1 id="t"></h1><p class="text" id="d"></p><div class="buttons"></div></div>
  </div>`;
  root.querySelector(".tag")!.textContent = card.demo ? "Mirror (demo)" : "Mirror";
  root.querySelector("h1")!.textContent = card.title;
  root.querySelector(".text")!.textContent = card.text;
  const done = (action: string, resume: boolean) => {
    host.remove();
    if (resume) for (const m of paused) void m.play().catch(() => {});
    void chrome.runtime.sendMessage({ cmd: "card", action });
  };
  const add = (label: string, action: string, main = false, resume = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (main) b.className = "main";
    b.onclick = () => done(action, resume);
    root.querySelector(".buttons")!.append(b);
    return b;
  };
  const first = card.back ? add("Back to studying", "back", true) : add("Close this tab", "close", true);
  if (card.back) add("Close this tab", "close");
  add("I'm here on purpose", "purpose", false, true);
  document.documentElement.append(host);
  first.focus();
}
