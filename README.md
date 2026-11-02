# Árvore da Mesa

## Sobre como este módulo foi feito

Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma issue. Todo retorno é bem-vindo.

---

**Versão 1.11.1** · Foundry VTT 14 · D&D 5e 6 · Português e English · Licença MIT · ✅ Testado no Foundry VTT e D&D 5e

![Árvore da Mesa no Foundry VTT](<docs/Arvore de Habilidades Completa.png>)

Árvores de habilidades visuais para o Foundry VTT. O mestre monta as árvores num mapa, define o que cada habilidade custa e exige, e os jogadores compram com Pontos de Habilidade, XP, Ouro ou recursos criados pelo próprio mestre. O que é comprado entra na ficha do personagem como talentos com botão de uso, efeitos e itens, e sai da ficha quando é reembolsado.

O módulo não vem com árvores prontas: você cria as suas ou importa arquivos JSON. A pasta [`Exemplo de Arvores`](<Exemplo de Arvores>) tem três árvores prontas para importar e servir de modelo.

O lado bom de importar é que você pode pedir para a sua IA analisar o código do módulo e montar uma árvore inteira para você em JSON. Ou, se preferir, pode se aventurar e criar a sua árvore do zero direto no mapa. Também é muito divertido.

## Sumário

- [Principais recursos](#principais-recursos)
- [Instalação e atualização](#instalação-e-atualização)
- [Suporte e sugestões](#suporte-e-sugestões)
- [Primeiros passos (mestre)](#primeiros-passos-mestre)
- [Para os jogadores](#para-os-jogadores)
- [Conceitos](#conceitos)
- [Ferramentas do mestre](#ferramentas-do-mestre)
- [Configurações](#configurações)
- [Integração com o Calendário da Mesa](#integração-com-o-calendário-da-mesa)
- [Importar e exportar](#importar-e-exportar)
- [Para macros e outros módulos](#para-macros-e-outros-módulos)
- [Solução de problemas](#solução-de-problemas)
- [Compatibilidade e testes](#compatibilidade-e-testes)
- [Arquivos do módulo](#arquivos-do-módulo)
- [Desenvolvimento](#desenvolvimento)
- [Licença](#licença)
- [English summary](#english-summary)

---

## Principais recursos

- **Editor visual** com arrastar e soltar, ligações entre habilidades, formas, cores, desenhos e textos no mapa.
- **Dois tipos de regra**: *D&D 5e* (Pontos de Habilidade, XP ou Ouro) e *Personalizado*, em que o mestre cria os próprios recursos (Pontos de Ki, Fragmentos de Alma…) e dá nome a cada campo de custo.
- **Habilidades completas na ficha**: ataques, testes de resistência, curas, transformações (troca de token), efeitos permanentes, itens concedidos e cargas de "ultimate".
- **Níveis por habilidade**, com custo crescente, descrição e valores diferentes a cada nível (`@rank`).
- **Requisitos**: habilidades anteriores, nível, atributo, classe, raça, itens, combos com outras árvores, marcos de campanha, escolhas exclusivas e data do calendário.
- **Treino**: habilidades que ficam prontas depois de alguns descansos longos.
- **Grandes Feitos e Pontos Míticos**, por árvore, que podem liberar árvores bloqueadas.
- **Árvores bloqueadas** até um Grande Feito, um item, um nível, uma classe ou uma data.
- **Habilidades temporárias** (bênçãos, maldições, itens amaldiçoados) que somem sozinhas.
- **Habilidades compartilhadas** entre árvores: edite uma vez, muda em todas.
- **Mesa do mestre**: visão geral dos personagens, recompensas em grupo, NPCs, diário da sessão e **Desfazer**.
- **Verificar** e **Estatísticas** para equilibrar as árvores.
- **Aviso no chat** quando uma habilidade nova fica disponível para o personagem.
- **Planejamento** e **reembolso** pelo jogador, com aprovação opcional do mestre.
- **Aba "Skill Tree" na ficha** (inclusive na Tidy 5e Sheets).
- **6 temas de cor** e interface em **português ou inglês**, conforme o idioma do Foundry.

---

## Instalação e atualização

### Instalar pelo Foundry (recomendado)

1. No Foundry, vá em **Módulos Complementares → Instalar Módulo**.
2. No campo **URL do Manifesto**, cole:

   ```
   https://github.com/Daphenius/arvore-habilidades/releases/latest/download/module.json
   ```

3. Clique em **Instalar**, entre no mundo e ative **Árvore da Mesa** em *Gerenciar Módulos*.

Instalado assim, o Foundry avisa quando houver versão nova e atualiza pelo botão de atualizar.

### Instalar manualmente

1. Baixe `arvore-habilidades.zip` na [página de releases](https://github.com/Daphenius/arvore-habilidades/releases).
2. Extraia em `Data/modules/arvore-habilidades` (a pasta precisa ter esse nome).
3. Reinicie o Foundry e ative **Árvore da Mesa** em *Gerenciar Módulos* no seu mundo.

### Abrir


Use o botão de árvore na barra de ferramentas de token, o atalho **Shift+K** ou o botão na ficha do personagem.

### Atualizar manualmente

1. Feche o mundo e faça uma cópia de segurança dos seus dados.
2. Guarde a pasta antiga do módulo fora de `Data/modules`.
3. Substitua a pasta inteira `Data/modules/arvore-habilidades` pela nova. Não mescle arquivos: arquivos antigos que não existem mais podem continuar na pasta.
4. Reinicie o Foundry e recarregue o navegador com **Ctrl+F5**.
5. Confira primeiro numa cópia do mundo.

Árvores e progresso ficam salvos no mundo, não na pasta do módulo, e são mantidos entre versões. Mesmo assim, faça backup antes de atualizar. Se depois de atualizar algo parecer estranho (botões faltando, janela quebrada), recarregue o navegador com Ctrl+F5.

---

## Suporte e sugestões

Encontrou um problema ou tem uma ideia? Abra uma [Issue no GitHub](https://github.com/Daphenius/arvore-habilidades/issues).

Para relatar um problema, inclua:

- versão do **Foundry VTT**, do sistema **D&D 5e** e da **Árvore da Mesa**;
- outros módulos ativos que possam estar envolvidos (ficha Tidy 5e, Calendário da Mesa…);
- **passo a passo** para o problema acontecer;
- o que você esperava e o que aconteceu;
- a **mensagem de erro** do console (aperte **F12**, aba *Console*), se houver;
- se possível, uma captura de tela ou a árvore exportada em JSON.

---

## Primeiros passos (mestre)

Na primeira vez que você abre o módulo aparece um guia rápido. O botão **?** na barra abre o guia de novo.

### A tela

- **Barra de cima**: seções, a Skill Tree aberta, o personagem que você está vendo, os pontos dele, *Planejar*, *Reembolsar várias* e a busca.
- **Faixa do mestre** (embaixo da barra):
  - à esquerda, o grupo **Skill Tree**: *Esta Skill Tree*, *Gerais*, *+ Skill Tree*, *Verificar*, *Estatísticas*, duplicar, exportar, importar e excluir;
  - à direita, **Mesa · Atribuir · Editar**.
- **Mapa** no centro e **painel lateral** à direita, com os detalhes da habilidade escolhida.

### Criar a primeira árvore

1. **+ Skill Tree** cria a árvore e abre as configurações dela. Dê um nome e escolha o tipo de regra em *Custos e regras*.
2. Clique em **Editar** para montar no mapa:
   - **Nova** cria uma habilidade no centro (ou solte um Item do Foundry no mapa);
   - **Shift+clique** numa habilidade e depois em outra liga as duas (a primeira passa a ser requisito da segunda);
   - **Ctrl+clique** seleciona várias; **Ctrl+C / Ctrl+V** copia e cola; **Ctrl+Z / Ctrl+Y** desfaz e refaz; **Del** exclui;
   - a barra flutuante do mapa tem lápis, elipse, texto, borracha, cores e espessura para desenhar.
3. Clique numa habilidade para editar no painel: aparência, custo e níveis, comportamento, requisitos, descrição, habilidades na ficha, itens concedidos e efeitos permanentes.
4. **Atribuir** escolhe quais personagens recebem a árvore.
5. **Modo Jogo** volta para a visão de jogo.

Use **Verificar** antes de liberar uma árvore para os jogadores: ele aponta habilidades soltas, requisitos impossíveis e outros problemas.

---

## Para os jogadores

- **Escolher personagem**: clique no seu nome na barra (se você tiver mais de um) ou selecione o token.
- **Comprar**: clique numa habilidade. As que brilham em verde estão disponíveis; use **Desbloquear** no painel. Se a árvore exige aprovação, o botão vira **Pedir ao mestre**.
- **Treino**: algumas habilidades mostram o botão **Treinar** com quantos descansos longos levam. Você paga na hora e a habilidade fica pronta depois desses descansos (pela ficha, pelo Calendário da Mesa ou pelo mestre). O painel mostra o progresso.
- **Botão cinza**: quando ainda não dá para desbloquear ou treinar, o botão aparece cinza com o motivo embaixo (pontos insuficientes, requisito faltando…).
- **Planejar**: monte um caminho clicando nas habilidades na ordem desejada e veja o custo antes de gastar.
- **Reembolsar várias**: devolve habilidades, se o mestre permitir. Tudo o que elas colocaram na ficha é removido.
- **Ficha**: a aba **Skill Tree** mostra pontos, progresso e habilidades de cada árvore.
- **Aviso no chat**: quando você sobe de nível, ganha pontos ou um Grande Feito e algo novo pode ser comprado, você recebe um aviso.

---

## Conceitos

### Seções

Organizam as árvores em abas (Fantasia é a inicial). O **+** cria, o lápis renomeia e a lixeira exclui. Ao excluir uma seção com árvores, você escolhe entre movê-las para outra seção ou excluí-las junto. Os jogadores veem só as seções que têm árvores atribuídas a eles.

### Tipos de regra

- **D&D 5e**: gasta Pontos de Habilidade (automáticos por nível), XP ou Ouro. O nome dos pontos é automático.
- **Personalizado**: a aba *Custos e regras* é toda editável.
  - **Recursos gastos**: crie quantos quiser. Cada um tem nome e um lugar onde fica guardado: contador próprio da árvore, campo da ficha (por exemplo `system.resources.primary.value`) ou XP. O primeiro é o recurso **principal**; para ele também dá para usar Pontos de Habilidade ou Ouro. Os outros viram campos de **custo extra** no editor de cada habilidade.
  - **Nomes dos campos de custo**: renomeie Custo, Níveis, Custo extra por nível, Custos extras, Peças de Ouro, Peças de Platina e Consome itens.
  - **Usar custos em moedas**: desligado, os campos de ouro e platina somem do editor.

**Ouro aceita Platina** (1 PL = 10 PO): o ouro é gasto primeiro e, se faltar, a platina é trocada e o troco volta em ouro. Cada pagamento guarda de onde saiu, e reembolsos e exclusões usam esse registro para devolver ao mesmo recurso. Compras feitas antes da versão 1.7.1 não têm esse registro; nelas vale o recurso atual da árvore.

### Habilidades

Cada habilidade tem:

- **Aparência**: forma, tamanho, cor e opção *Secreta* (o jogador vê `???` até cumprir os requisitos). A opção só esconde na interface: as árvores ficam numa configuração do mundo, que um jogador curioso consegue ler pelo console do navegador.
- **Custo e níveis**: custo, pago com o recurso da árvore ou com Pontos Míticos, número de níveis, custo extra por nível, custos extras, moedas e itens consumidos.
- **Comportamento**:
  - *Evolução*: substitui na ficha a habilidade anterior;
  - *Sinergia*: libera sozinha e de graça quando os requisitos são cumpridos;
  - *Treino*: quantos descansos longos leva para ficar pronta.
- **Requisitos**: habilidades anteriores (todas ou qualquer uma), nível, atributo mínimo, raça, classe, itens ou talentos, combo com habilidades de outras árvores, marco da campanha, escolha exclusiva (grupo) e data do calendário. O que ficar vazio não é exigido.
- **Habilidades na ficha**: cada uma vira um talento com botão de uso (ataque, teste de resistência, cura, transformação ou passiva), com valores por nível.
- **Itens concedidos** e **efeito permanente**.

### Grandes Feitos e Pontos Míticos

Cada árvore tem os seus Grandes Feitos (modo Editar → painel → **Novo Grande Feito**). Conceder um feito dá Pontos Míticos, pode registrar um marco e pode liberar árvores bloqueadas. Habilidades marcadas como pagas com Pontos Míticos usam esses pontos.

### Árvores bloqueadas

Em *Esta Skill Tree → Geral → Disponível*, a árvore pode ficar liberada **sempre** ou só:

- depois de um **Grande Feito**;
- quando o personagem tiver um **item** (pelo nome);
- quando o personagem chegar a um **nível**;
- quando o personagem tiver uma **classe** (com nível mínimo opcional);
- a partir de uma **data do calendário**.

O jogador vê um cadeado e o que falta, a não ser que você marque *Esconder dos jogadores enquanto bloqueada*.

### Habilidades temporárias

No painel da habilidade, **Conceder temporária** dá o nível de graça e tira sozinho depois de X descansos longos ou numa data. O nível temporário fica marcado: quando expira, sai só ele, e os níveis pagos continuam. O painel oferece **Tornar permanente** e **Remover agora**.

### Habilidades compartilhadas

Em **Modelos → De outras árvores**, **Inserir vinculada** coloca a mesma habilidade em outra árvore. Editar uma cópia muda todas. A posição no mapa, as ligações, o grupo, os combos e o progresso de cada árvore continuam separados. **Desvincular desta árvore** no editor torna a cópia independente.

### Reembolso e limpeza das fichas

Tudo o que uma árvore coloca na ficha leva uma marca. Ao reembolsar, o módulo remove os itens e efeitos marcados daquela habilidade e devolve o pagamento ao recurso de onde saiu, aplicando a porcentagem de reembolso da árvore. Itens que o jogador copiou ou alterou à mão fora do módulo podem não ser reconhecidos. Ao **excluir uma árvore** (ou uma seção com árvores), os pontos voltam e tudo o que ela colocou nas fichas é removido na hora. Ao excluir uma habilidade avulsa no modo Editar, a limpeza é feita quando a janela fecha, para o Ctrl+Z continuar funcionando. **Mesa → Corrigir pontos** faz essa limpeza manualmente.

---

## Ferramentas do mestre

- **Mesa**: um cartão por personagem com pontos, pedidos, treino e o progresso em cada árvore, mais estes atalhos:
  - Recompensa em grupo;
  - Passar 1 descanso longo (treino e temporárias de todos);
  - Aplicar Skill Tree em NPC;
  - Grande Feito;
  - Diário da sessão (texto pronto para o Discord);
  - Corrigir pontos.
- **Desfazer** (na Mesa): concessões grátis e temporárias, recompensas, ± de pontos, Grandes Feitos e NPCs ficam registrados. *Desfazer* volta os dados da árvore, os pontos e os itens criados pelo módulo ao estado anterior. Mudanças feitas depois por outros meios (à mão na ficha, por outro módulo) podem ser sobrescritas, então desfaça logo depois do engano. Ficam guardadas as 15 últimas ações.
- **Atribuir**: escolhe quem recebe a árvore, com aviso opcional no chat.
- **±**: dá ou tira pontos do personagem, inclusive dos recursos extras.
- **Conceder grátis**: dá um nível sem custo nem requisitos.
- **Pedidos**: com *Exigir aprovação do mestre*, as compras viram pedidos para você aprovar ou recusar.
- **Verificar**: lista erros, avisos e dicas (habilidades soltas, custo 0, combos quebrados, requisitos impossíveis, nomes repetidos, sobreposições, bloqueios quebrados). Clique num item para ir até a habilidade.
- **Estatísticas**: custo total para pegar tudo em cada recurso, treino total, nível necessário com Pontos de Habilidade e o caminho mais barato até cada habilidade.
- **Modelos**: salve uma habilidade como modelo e insira em qualquer árvore.

---

## Configurações

### Esta Skill Tree

Vale só para a árvore aberta. Tem três abas:

- **Geral**: nome, seção, descrição, reembolso pelo jogador, % devolvido, aprovação do mestre e disponibilidade.
- **Custos e regras**: tipo de regra, recursos, nomes dos campos e custo crescente.
- **Visual**: ligações, grade, fundo e som.

### Gerais

Vale para todas as árvores e abre mesmo sem nenhuma árvore:

- Pontos de Habilidade por nível e nível máximo que dá pontos.
- Aviso ao subir de nível e aviso de habilidade disponível.
- Botão e aba "Skill Tree" na ficha, e som padrão.
- **Backup**: exporta todas as Skill Trees num JSON só.
- **Zona de perigo → Zerar Árvores**: exclui todas as árvores e devolve os pontos. Pede confirmação, oferece baixar um backup antes e pode apagar também as seções.

Essas opções também aparecem em *Configurações do Jogo → Configurar Módulos*.

### Tema e idioma

- **Tema**: o botão de paleta na barra (ou *Configurar Módulos → Tema de cores*) escolhe entre Dourado, Azul, Roxo, Esmeralda, Carmesim e Claro. Cada pessoa escolhe o seu.
- **Idioma**: segue o Foundry. Em português, tudo em português; em qualquer outro idioma, a interface fica em inglês. Nomes e textos criados pelo mestre nunca são traduzidos. Todos os textos ficam em `lang/pt-BR.json` e `lang/en.json`: para traduzir para outro idioma, basta copiar o `en.json`, traduzir e registrar o arquivo em `languages` no `module.json`.

---

## Integração com o Calendário da Mesa

Com o módulo **Calendário da Mesa** (`calendario-mesa`) ativo:

- as datas usam o calendário do mundo, com o nome do dia, do mês e o ano, e são escolhidas por ano, mês e dia;
- habilidades temporárias e árvores ou habilidades liberadas por data são conferidas a cada dia novo do calendário;
- o botão **Descanso longo** do relógio (Calendário 4.2.1 ou mais novo) conta como descanso longo para o treino e as habilidades temporárias de todos os personagens.

Sem o Calendário da Mesa, o módulo conta os dias pelo tempo nativo do Foundry, com datas escolhidas em "dias a partir de hoje".

---

## Importar e exportar

- **Exportar** (faixa Skill Tree): baixa a árvore aberta como pacote JSON, junto com os itens usados por ela.
- **Gerais → Exportar todas**: backup de todas as árvores num arquivo só.
- **Importar → Arquivo**: escolha um JSON do computador.
- **Importar → Link**: cole o endereço de um JSON na internet. Links de página do GitHub (`…/blob/…`) e de Gist viram o arquivo puro sozinhos. O site precisa permitir download direto; se bloquear, baixe o arquivo e use *Arquivo*.

Ao importar uma árvore que já existe no mundo, você escolhe:

- **Atualizar a existente**: mantém ID, seção, atribuições e progresso; as habilidades são associadas pelo ID e depois pelo nome.
- **Criar outra cópia**: a cópia nova não tem ninguém atribuído; use **Atribuir** depois.

Para começar, experimente importar um dos arquivos da pasta `Exemplo de Arvores` do repositório (Escolhido da Matrona dos Corvos, Escolhido do Coração Arcano e Guerreira do Poder).

Pacotes com várias árvores mantêm os combos e bloqueios entre elas. O módulo confere o arquivo antes de importar e recusa os que passam de 20 MB ou trazem IDs inválidos, ligações em ciclo ou dados fora do formato esperado. Mesmo assim, faça um backup (**Gerais → Exportar todas**) antes de importar algo grande.

---

## Para macros e outros módulos

```js
const api = game.modules.get("arvore-habilidades").api;
api.open();                            // abre a janela
api.openFor(actorId, treeId, nodeId);  // abre num personagem, árvore e habilidade
api.trees();                           // lista das Skill Trees
api.fixPoints();                       // devolve pontos e limpa fichas de habilidades excluídas
api.version;                           // versão instalada (a do module.json)
```

O progresso de cada personagem fica em `flags.world` do ator (`skillTree`, `skillRanks`, `skillTraining`, `skillTemp`, `mythic`…). Os itens e efeitos criados pelo módulo têm `flags.world.skillTree = { tree, node }`.

---

## Solução de problemas

- **Janela quebrada ou visual antigo logo depois de atualizar**: o navegador pode estar com arquivos velhos guardados. Recarregue com Ctrl+F5.
- **Pontos não voltaram depois de excluir algo**: use **Mesa → Corrigir pontos**.
- **Falha ao salvar**: a edição continua na janela e o fechamento é interrompido. Resolva a conexão e feche de novo. Se outra janela alterou as mesmas árvores, exporte suas edições antes de recarregar.
- **Importar por link não funciona**: o site bloqueou o download direto. Baixe o arquivo e use *Importar → Arquivo*.
- **Treino ou temporária não avança**: contam descansos longos feitos pela ficha do D&D 5e, pelo botão **Descanso longo** do Calendário da Mesa (4.2.1 ou mais novo) ou por **Passar 1 descanso longo** (no painel do personagem ou na Mesa, para todos). Avançar o relógio de outro jeito não conta como descanso. O mestre também pode usar *Concluir treino agora* ou *Remover agora*.

---

## Compatibilidade e testes

- Foundry VTT: mínimo 14, verificado 14.369.
- Sistema D&D 5e: mínimo 6.0.0, verificado 6.0.6.
- Opcionais: Tidy 5e Sheets (aba na ficha), Calendário da Mesa (datas).

### Testado e aprovado

Cada versão é **testada pelo autor no Foundry VTT 14 com o sistema D&D 5e 6** logo depois de atualizada.

Além disso, o módulo tem 51 testes automatizados que simulam o Foundry (compras, reembolsos, treino, temporárias, desfazer, importação, limpeza das fichas, tradução e mais). Como em qualquer módulo, recomendamos fazer backup do mundo antes de atualizar. Para rodar os testes com Node.js 22 ou posterior, na pasta que contém `arvore-habilidades`:

```sh
node arvore-habilidades/tests/regression.mjs
```

Um dos testes confere os JSONs da pasta `Exemplo de Arvores`.

---

## Arquivos do módulo

| Arquivo | Conteúdo |
| --- | --- |
| `scripts/main.js` | inicialização, atalho, botão na barra e API |
| `scripts/core.js` | constantes, configurações, listas de opções, modelos e leitura das árvores |
| `scripts/regras.js` | níveis, custos, pagamentos, pré-requisitos, bloqueios e sinergias |
| `scripts/compras.js` | desbloquear, reembolsar, pontos presos e treino |
| `scripts/itens.js` | talentos, efeitos e itens que cada habilidade põe na ficha |
| `scripts/temporarias.js` | habilidades temporárias e descansos longos |
| `scripts/chat.js` | cartões no chat, efeitos visuais e pedidos ao mestre |
| `scripts/ficha.js` | botão e aba "Skill Tree" na ficha (dnd5e e Tidy 5e) |
| `scripts/hooks.js` | automações de fundo e aviso de habilidade disponível |
| `scripts/migracoes.js` | migrações de versões antigas e da macro |
| `scripts/settings.js` | configurações registradas no Foundry |
| `scripts/app.js` | base da janela |
| `scripts/app-canvas.js` | mapa: desenho, arrastar, zoom, ligações |
| `scripts/app-panel.js` | painel lateral no modo jogo |
| `scripts/app-editor.js` | editor de habilidade |
| `scripts/app-dialogs.js` | janelas de configuração: seções, modelos, Skill Tree, gerais, temas, personagens |
| `scripts/app-mesa.js` | Mesa do mestre: recompensas, NPCs, Grandes Feitos, diário, corrigir pontos |
| `scripts/app-io.js` | importar e exportar |
| `scripts/app-actions.js` | ações dos botões |
| `scripts/app-undo.js` | desfazer do mestre |
| `scripts/app-tools.js` | Verificar e Estatísticas |
| `scripts/app-welcome.js` | guia de boas-vindas |
| `scripts/ui-kit.js` | peças de interface compartilhadas |
| `scripts/persistence.js` | fila de gravação |
| `scripts/operations.js` | operações seguras nas fichas, com recuperação em caso de falha |
| `scripts/validation.js` | validação de importação |
| `scripts/idioma.js` | `loc()`: busca os textos em `lang/` no idioma do usuário |
| `lang/` | todos os textos da interface, em português (`pt-BR.json`) e inglês (`en.json`) |
| `styles/arvore-habilidades.css` | visual e temas |
| `CHANGELOG.md` | histórico de versões |
| `LICENSE` | licença MIT |
| `docs/` | capturas de tela |
| `Exemplo de Arvores/` | árvores prontas em JSON para importar (ficam só no repositório, fora do ZIP) |
| `tools/` | ferramentas de desenvolvimento: refazer imports, achar texto sem tradução (ficam só no repositório, fora do ZIP) |
| `eslint.config.mjs` | verificação do código (imports sem uso, nomes indefinidos) |
| `.github/workflows/release.yml` | monta e anexa o ZIP e o `module.json` ao publicar uma release |

---

## Desenvolvimento

Idealizado e desenvolvido por **Daphenius**, com auxílio de Claude e ChatGPT na elaboração, revisão e refatoração do código.

A definição das funcionalidades, as decisões do projeto e os testes dentro do Foundry VTT foram realizados pelo autor.

Por que a opção *Secreta* não esconde os dados de verdade: avaliado na 1.11.0. Para isso, as árvores teriam de sair da configuração do mundo e chegar a cada jogador pelo mestre (socket), só com as habilidades que aquele personagem pode ver. Mas o que fica visível muda a cada compra, nível, item ou Grande Feito, e o computador do jogador precisa da árvore inteira para conferir requisitos entre árvores, sinergias e montar os itens na compra. Seria preciso o mestre estar sempre conectado (hoje o jogador compra sozinho) e mexer no caminho das compras, que é a parte mais testada do módulo. Ficou o aviso.

Testes automáticos: `node tests/regression.mjs` na pasta do repositório (ou `node arvore-habilidades/tests/regression.mjs` da pasta de cima; precisa só do Node 20 ou mais novo). Termina com `TOTAL: N passed` e código de saída 0. Os testes rodam num Foundry simulado: não substituem o teste no Foundry de verdade. Verificação do código: `npx eslint scripts/`. Depois de mover funções entre arquivos, `node tools/arrumar-imports.mjs --gravar` refaz os imports (antes, `cd tools && npm i`).

---

## Licença

Distribuído sob a **licença MIT**: você pode usar, copiar, modificar e redistribuir, inclusive em projetos comerciais, desde que mantenha o aviso de copyright e a licença. Veja o arquivo [`LICENSE`](LICENSE).

Copyright © 2026 Daphenius.

---

## English summary

**Árvore da Mesa** is a visual skill tree editor for Foundry VTT 14 and D&D 5e 6. The GM builds trees on a map and players buy abilities with Skill Points, XP, Gold or custom resources. Bought abilities become sheet features (attacks, saves, heals, transformations, effects, granted items) and are removed again on refund.

Highlights: custom resources with renamable cost fields, multi-level abilities, requirements (abilities, level, class, race, items, cross-tree combos, milestones, exclusive choices, calendar dates), training over long rests, Great Deeds and Mythic Points, locked trees (deed, item, level, class or date), temporary abilities, shared abilities across trees, a GM Table with group rewards and undo, a tree validator and statistics, a chat notice when new abilities become available, player planning and refunds, a sheet tab (Tidy 5e supported), six color themes, and an English interface when Foundry is not set to Portuguese.

Every version is tested by the author in Foundry VTT 14 with the D&D 5e 6 system right after it is updated. Install from Foundry with the manifest URL `https://github.com/Daphenius/arvore-habilidades/releases/latest/download/module.json` (or extract the release ZIP into `Data/modules/arvore-habilidades`), enable it, and open it with the toolbar button or **Shift+K**. A quick guide appears the first time; the **?** button opens it again. Issues and suggestions: [GitHub Issues](https://github.com/Daphenius/arvore-habilidades/issues). Licensed under MIT.
