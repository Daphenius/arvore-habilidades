// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — boas-vindas (mini-tutorial)
//  Aparece na primeira vez que cada pessoa abre a janela; o botão "?" reabre.
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { MOD } from "./core.js";
import { DialogV2 } from "./ui-kit.js";

const gmSteps = () => [
  { icon: "fa-sitemap", title: loc("ARVORE.Guia.bemVindoAArvoreDaMesa"), body: loc("ARVORE.Guia.passo.mestre1") },
  { icon: "fa-pen-ruler", title: loc("ARVORE.Guia.montarUmaArvore"), body: loc("ARVORE.Guia.passo.mestre2") },
  { icon: "fa-users", title: loc("ARVORE.Guia.darParaOsJogadores"), body: loc("ARVORE.Guia.passo.mestre3") },
  { icon: "fa-wand-magic-sparkles", title: loc("ARVORE.Guia.dicas"), body: loc("ARVORE.Guia.passo.mestre4") }
];
const playerSteps = () => [
  { icon: "fa-sitemap", title: loc("ARVORE.Guia.bemVindoAArvoreDaMesa"), body: loc("ARVORE.Guia.passo.jogador1") },
  { icon: "fa-hand-pointer", title: loc("ARVORE.Guia.comprarUmaHabilidade"), body: loc("ARVORE.Guia.passo.jogador2") },
  { icon: "fa-route", title: loc("ARVORE.Guia.planejarEReembolsar"), body: loc("ARVORE.Guia.passo.jogador3") }
];

export class MixWelcome {
  async welcomeDialog() {
    const steps = this.gm ? gmSteps() : playerSteps();
    const dots = steps.map((_, i) => `<i data-dot="${i}" class="${i ? "" : "on"}"></i>`).join("");
    await DialogV2.prompt({
      window: { title: loc("ARVORE.Guia.boasVindas"), icon: "fas fa-circle-question" }, position: { width: 480 },
      content: `<div class="st-c st-welcome">
        ${steps.map((s, i) => `<section data-step="${i}" ${i ? "hidden" : ""}><div class="st-wel-ico"><i class="fas ${s.icon}"></i></div><h3>${s.title}</h3><p>${s.body}</p></section>`).join("")}
        <div class="st-wel-nav"><button type="button" class="st-c-btn" data-wel="-1" disabled><i class="fas fa-arrow-left"></i> ${loc("ARVORE.Guia.voltar")}</button>
          <span class="st-wel-dots">${dots}</span>
          <button type="button" class="st-c-btn" data-wel="1">${loc("ARVORE.Guia.proximo")} <i class="fas fa-arrow-right"></i></button></div>
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element; if (!el?.querySelector) return;
        let i = 0; const last = steps.length - 1;
        const go = d => {
          i = Math.max(0, Math.min(last, i + d));
          el.querySelectorAll("[data-step]").forEach(s => { s.hidden = Number(s.dataset.step) !== i; });
          el.querySelectorAll("[data-dot]").forEach(s => s.classList.toggle("on", Number(s.dataset.dot) === i));
          el.querySelector('[data-wel="-1"]').disabled = i === 0;
          el.querySelector('[data-wel="1"]').hidden = i === last;
        };
        el.querySelectorAll("[data-wel]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); go(Number(b.dataset.wel)); }));
      },
      ok: { label: loc("ARVORE.Guia.comecar"), icon: "fas fa-check" },
      rejectClose: false
    });
    try { await game.settings.set(MOD, "welcomeSeen", true); } catch (e) { console.warn("Árvore da Mesa | guia de boas-vindas", e); }
  }
  maybeWelcome() {
    let seen = true; try { seen = game.settings.get(MOD, "welcomeSeen"); } catch (e) { console.warn("Árvore da Mesa | guia de boas-vindas", e); }
    if (seen === false && !this._welcomed) { this._welcomed = true; setTimeout(() => this.welcomeDialog(), 400); }
  }
}
