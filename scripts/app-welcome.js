// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — boas-vindas (mini-tutorial)
//  Aparece na primeira vez que cada pessoa abre a janela; o botão "?" reabre.
// ═══════════════════════════════════════════════════════════════════════════

import { L } from "./i18n.js?v=1.7.7";
import { MOD } from "./core.js?v=1.7.7";
import { DialogV2 } from "./ui-kit.js?v=1.7.7";

const gmSteps = () => [
  { icon: "fa-sitemap", title: L("Bem-vindo à Árvore da Mesa"), body: L("Aqui você monta árvores de habilidades para os personagens comprarem com Pontos de Habilidade, XP, Ouro ou recursos que você mesmo cria. Em cima ficam as <b>seções</b>, a <b>Skill Tree</b> aberta e o <b>personagem</b> que você está vendo.") },
  { icon: "fa-pen-ruler", title: L("Montar uma árvore"), body: L("Na faixa de baixo, <b>+ Skill Tree</b> cria uma árvore e <b>Esta Skill Tree</b> define custos, regras e visual. Clique em <b>Editar</b> para montar no mapa: <b>Nova</b> cria uma habilidade e <b>Shift+clique</b> numa e depois noutra liga as duas.") },
  { icon: "fa-users", title: L("Dar para os jogadores"), body: L("<b>Atribuir</b> escolhe quem recebe a árvore. A <b>Mesa</b> mostra todos os personagens, dá recompensas, Grandes Feitos e aplica árvores em NPCs. Errou? A Mesa tem <b>Desfazer</b>.") },
  { icon: "fa-wand-magic-sparkles", title: L("Dicas"), body: L("<b>Verificar</b> aponta problemas na árvore e <b>Estatísticas</b> mostra quanto custa pegar tudo. A paleta troca o tema de cores. Em <b>Gerais</b> ficam o backup e o Zerar Árvores. O botão <b>?</b> abre este guia de novo.") }
];
const playerSteps = () => [
  { icon: "fa-sitemap", title: L("Bem-vindo à Árvore da Mesa"), body: L("Aqui você vê as Skill Trees do seu personagem. Em cima ficam a <b>árvore</b> aberta, o seu <b>personagem</b> e quantos <b>pontos</b> você tem.") },
  { icon: "fa-hand-pointer", title: L("Comprar uma habilidade"), body: L("Clique numa habilidade para ver o que ela faz e o que precisa. As que brilham em verde estão disponíveis: use <b>Desbloquear</b> no painel. Algumas pedem <b>treino</b>: você paga e ela fica pronta depois de alguns descansos longos.") },
  { icon: "fa-route", title: L("Planejar e reembolsar"), body: L("<b>Planejar</b> mostra o custo de um caminho antes de gastar. <b>Reembolsar várias</b> devolve habilidades, se o mestre permitir. A ficha também tem uma aba <b>Skill Tree</b>. O botão <b>?</b> abre este guia de novo.") }
];

export class MixWelcome {
  async welcomeDialog() {
    const steps = this.gm ? gmSteps() : playerSteps();
    const dots = steps.map((_, i) => `<i data-dot="${i}" class="${i ? "" : "on"}"></i>`).join("");
    await DialogV2.prompt({
      window: { title: L("Boas-vindas"), icon: "fas fa-circle-question" }, position: { width: 480 },
      content: `<div class="st-c st-welcome">
        ${steps.map((s, i) => `<section data-step="${i}" ${i ? "hidden" : ""}><div class="st-wel-ico"><i class="fas ${s.icon}"></i></div><h3>${s.title}</h3><p>${s.body}</p></section>`).join("")}
        <div class="st-wel-nav"><button type="button" class="st-c-btn" data-wel="-1" disabled><i class="fas fa-arrow-left"></i> ${L("Voltar")}</button>
          <span class="st-wel-dots">${dots}</span>
          <button type="button" class="st-c-btn" data-wel="1">${L("Próximo")} <i class="fas fa-arrow-right"></i></button></div>
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
      ok: { label: L("Começar"), icon: "fas fa-check" },
      rejectClose: false
    });
    try { await game.settings.set(MOD, "welcomeSeen", true); } catch { }
  }
  maybeWelcome() {
    let seen = true; try { seen = game.settings.get(MOD, "welcomeSeen"); } catch { }
    if (seen === false && !this._welcomed) { this._welcomed = true; setTimeout(() => this.welcomeDialog(), 400); }
  }
}
