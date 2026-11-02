# Histórico de versões — Árvore da Mesa

## 1.11.0

- **Erros não somem mais em silêncio:** vários pontos (som ao subir de nível, animação da transformação, data do Calendário da Mesa, leitura das configurações, tema, guia de boas-vindas) engoliam qualquer erro sem deixar rastro. Agora eles avisam no console (F12) com "Árvore da Mesa | …", o que ajuda a achar a causa se algo não funcionar.
- **Arrastar no mapa:** ao soltar um desenho, uma borracha ou uma habilidade arrastada, os "ouvintes" do mouse eram removidos duas vezes, em dois lugares. Agora um lugar só cuida disso.
- **Restos de recursos antigos removidos:** a configuração "presets" (gravada só na migração da macro e nunca lida) e os campos `preset`, `presetKey` e `ingredients` dos modelos prontos antigos. Árvores e JSONs antigos continuam abrindo e importando normalmente: esses campos são simplesmente ignorados.
- Nomes internos padronizados em português e o relatório antigo `docs/RELATORIO-1.2.0.md` apagado.
- **Habilidades secretas:** avaliamos guardar as árvores fora do alcance dos jogadores. Isso exigiria o mestre sempre conectado para os jogadores comprarem e mexeria no caminho das compras; por isso continua valendo o aviso do README (a opção *Secreta* esconde na interface, não no console). A explicação está no README, em Desenvolvimento.
- Nenhuma mudança nas regras de pontos, compras, reembolsos, treino ou habilidades temporárias. Os testes passam sem mensagens de erro escondidas, e entrou um teste novo para os campos antigos.

## 1.10.0

- **Código reorganizado (por dentro):** o arquivo principal, que tinha quase 2.000 linhas misturando regras, ficha, chat, automações, migrações e configurações, foi dividido em arquivos menores, cada um com um assunto: `regras.js`, `compras.js`, `itens.js`, `temporarias.js`, `chat.js`, `ficha.js`, `hooks.js`, `migracoes.js` e `settings.js`. As janelas da Mesa do mestre saíram para `app-mesa.js`. Nenhum arquivo passa de ~600 linhas.
- **Imports enxutos:** cada arquivo agora importa só o que usa (antes, quase todos importavam os mesmos ~150 nomes). Um verificador (ESLint) confere imports sem uso e nomes que não existem.
- **Janela mais leve em árvores grandes:** para calcular o custo de cada habilidade, o módulo copiava a lista inteira de níveis do personagem uma vez por habilidade, a cada desenho da janela. Agora lê a lista uma vez, sem copiar.
- As funções foram só movidas de lugar: as regras de pontos, compras, reembolsos, treino e habilidades temporárias são as mesmas. Os 51 testes continuam passando, e entrou mais um que confere a leitura dos níveis.

## 1.9.0

- **Inglês completo, no padrão do Foundry:** todos os textos da interface agora ficam em `lang/pt-BR.json` e `lang/en.json` (cerca de 1.150 textos), como em qualquer módulo do Foundry. Antes, o inglês era um dicionário dentro do código que traduzia procurando pedaços do texto em português: qualquer letra mudada no português fazia aquele trecho sair sem tradução, sem aviso.
- **Textos que ainda saíam em português com o Foundry em inglês:** o guia de boas-vindas (frases pela metade, como "aberta e o personagem"), o resumo das Estatísticas, avisos como "acabou para", "reduziu", "carregada", as unidades de duração (rodadas, minutos, horas, dias), o tamanho "Normal" e as mensagens de erro ao importar um JSON inválido.
- **Outros idiomas:** dá para traduzir o módulo copiando o `en.json`; o README explica como.
- Os testes agora conferem que toda chave usada no código existe nos dois idiomas, com os mesmos `{valores}`.
- Nenhuma mudança nas regras de pontos, compras, reembolsos, treino ou habilidades temporárias.

## 1.8.0

- **Versão num lugar só:** o número da versão agora fica só no `module.json`. Antes ele estava repetido em 17 arquivos de código, no estilo (CSS) e em duas constantes; quando um deles ficava para trás, o módulo achava que o navegador estava com arquivos velhos (foi o que causou o aviso de "CSS em cache" da 1.7.10).
- **Sem recarregar sozinho:** saiu a verificação que, ao abrir o mundo, comparava versões, trocava o CSS e às vezes recarregava a página. Ela só existia por causa do esquema acima. Se depois de atualizar algo parecer estranho, aperte Ctrl+F5.
- **Para macros:** `game.modules.get("arvore-habilidades").api.version` mostra a versão instalada.
- README: a seção "Sobre como este módulo foi feito" agora vem logo abaixo do título.
- Nenhuma mudança nas regras de pontos, compras, reembolsos, treino ou habilidades temporárias. Os 51 testes continuam passando.

## 1.7.10

- **Aviso de "CSS em cache" corrigido:** o arquivo de estilos trazia um número de versão antigo (1.7.5), então o módulo achava que o navegador estava usando arquivos velhos toda vez que carregava e recarregava o estilo à toa. Agora a versão do CSS acompanha a do módulo.
- **Descrições importadas mais seguras:** o texto da descrição de uma habilidade (digitado ou vindo de um JSON importado) passa por uma limpeza antes de aparecer no painel. Scripts, iframes e links do tipo `javascript:` escondidos numa árvore baixada da internet não rodam mais.
- **Conceder temporária:** a concessão e a marca de "temporária" agora são gravadas de uma vez só. Antes, se a gravação falhasse no meio, a habilidade podia ficar na ficha como permanente.
- **Aba Skill Tree na ficha:** a cada vez que a ficha era redesenhada, o módulo adicionava mais um "ouvinte" nos cliques das abas; com o tempo isso acumulava. Agora entra uma vez só.
- **Inglês:** vários textos que ainda saíam em português com o Foundry em inglês (histórico "desbloqueou/reembolsou", regras geradas das habilidades como "alcance", "dura", "desarmado", "sucesso: nada acontece", o cartão de Grande Feito "recebe/recebem", mensagens de permissão) agora seguem o idioma. As datas do histórico também seguem o idioma do Foundry.
- README: a opção *Secreta* só esconde na interface (os dados das árvores ficam numa configuração do mundo); removida uma linha solta no topo. O relatório da revisão 1.2.0 foi para a pasta `docs/`.
- Limpeza interna: código morto removido, um texto que ainda dizia "macro" passou a dizer "árvore".

## 1.7.9

- **Tipos de efeito corrigidos no Foundry 14:** o Foundry 14 deixou de listar os tipos básicos (Adicionar, Multiplicar, Substituir, Aumentar até, Reduzir até, Personalizado) junto com os extras. Por isso, o menu de tipo no editor de efeitos mostrava só os extras (Bonus, Advantage Mode, Roll Maximum/Minimum e o do Automated Conditions 5e), e um efeito novo podia ficar salvo com o tipo errado. Agora os tipos básicos voltam a aparecer primeiro, e os extras continuam disponíveis no fim da lista.
- Sumiu o aviso "Árvore da Mesa | não encontrei o tipo 'Adicionar'" no console.
- **Confira suas árvores:** se você criou ou editou efeitos depois de atualizar para o Foundry 14, abra o editor e veja se o tipo de cada efeito está certo (por exemplo, "Adicionar" para +1 na CA).

## 1.7.8

- **Idioma corrigido:** com o Foundry em inglês, a Árvore agora aparece em inglês. Antes, ela lia o idioma cedo demais, quando o Foundry ainda informava o idioma padrão do servidor (definido na tela de Configuração), e ficava em português mesmo com o usuário em inglês.
- O nome padrão da primeira seção (Fantasia / Fantasy) segue o idioma, a menos que o mestre o tenha renomeado.

## 1.7.7

- **Descanso longo feito pelo jogador na própria ficha agora conta** para o treino e para as habilidades temporárias. O D&D 5e só avisa o descanso no computador de quem descansou, então antes só funcionava quando o mestre fazia o descanso. Agora a ficha guarda o descanso e o computador do mestre conta na hora.
- Se o mestre estiver fora, os descansos ficam guardados e são contados quando ele entrar no mundo.
- O mestre recebe um aviso "Descanso longo de (personagem): treino e habilidades temporárias contados" sempre que um descanso conta.

## 1.7.6

- **Atualizar não exige mais reiniciar o Foundry.** A versão é lida direto do `module.json` atualizado, e não da cópia que o Foundry guarda na memória até reiniciar. Antes, essa diferença mostrava o aviso "arquivos antigos" mesmo com tudo certo.
- Se o navegador ainda estiver com arquivos velhos, o módulo recarrega a página sozinho uma vez. O aviso de Ctrl+F5 só aparece se isso não resolver.
- A lista de módulos do Foundry pode continuar mostrando o número antigo até o próximo reinício; isso é só o rótulo, o módulo já roda a versão nova.
- README: selo **Testado no Foundry VTT e D&D 5e**, válido para todas as versões.

## 1.7.5

- Botão **Treinar** para os jogadores: habilidades com treino mostram "Treinar — N descansos longos · custo". Com aprovação do mestre, "Pedir ao mestre para treinar".
- O botão principal da habilidade (Treinar, Desbloquear, Subir de nível) aparece sempre; quando ainda não dá, fica cinza com o motivo embaixo (ex.: pontos insuficientes, falta um requisito).
- Repositório reorganizado: arquivos do módulo na raiz (necessário para a release automática).
- README unificado: capturas de tela reais, seção "Sobre como este módulo foi feito" e dica de pedir para a IA montar árvores em JSON.
- Pasta **Exemplo de Arvores** no repositório com três árvores prontas para importar (Escolhido da Matrona dos Corvos, Escolhido do Coração Arcano e Guerreira do Poder). Ela fica fora do ZIP do módulo.

## 1.7.4

- **Descanso longo conta para as habilidades temporárias em todos os caminhos**: pela ficha (como antes), pelo botão **Descanso longo** do Calendário da Mesa (precisa do Calendário 4.2.1, que agora avisa a Árvore) e pelo botão do mestre.
- "Passar 1 dia de treino" virou **Passar 1 descanso longo**: no painel do personagem conta para ele; na Mesa conta para todos. Agora conta o treino **e** as temporárias (antes só o treino).
- Textos do painel explicam onde o descanso é contado.

## 1.7.3

- **Testada e aprovada pelo autor no Foundry VTT** antes da publicação.
- Novo nome: **Árvore da Mesa** (o `id` continua `arvore-habilidades`, então árvores e progresso salvos nos mundos não mudam).
- Pronto para publicar no GitHub: licença MIT, `module.json` com manifesto, download, licença, README, changelog e Issues, e recomendação do Calendário da Mesa e da Tidy 5e.
- Automação de release: ao publicar uma release, o GitHub monta `arvore-habilidades.zip` (com o `module.json` na raiz) e anexa os dois arquivos.
- README: instalação pelo manifesto, suporte e sugestões, licença, captura de tela e descrições mais cuidadosas.

## 1.7.2

- README reescrito (guia completo de uso) e histórico movido para este arquivo.
- Autor do módulo: Daphenius.

## 1.7.1 — correções

- **Excluir árvore com recurso personalizado**: cada pagamento guarda de onde saiu (Pontos de Habilidade, Ouro ou o campo/contador). Excluir a árvore, reembolsar ou cancelar treino devolve para o recurso certo, mesmo que a árvore tenha mudado de recurso depois. Pagamentos antigos, sem esse registro, usam o recurso atual da árvore (ou Pontos de Habilidade se ela não existir mais).
- **Desfazer restaura a ficha**: guarda uma cópia dos itens e efeitos que a árvore colocou na ficha e recria os que a ação apagou (por exemplo, numa evolução de nível).
- **Temporária + nível pago**: o nível temporário fica marcado. Quando expira, sai só ele; o nível pago e o seu reembolso continuam. Um reembolso comum devolve o último nível pago.
- **Importar várias árvores juntas**: combos e bloqueios entre árvores do mesmo arquivo continuam apontando certo.
- **Excluir árvore limpa as fichas na hora** (também ao excluir uma seção com árvores). Ctrl+Z traz a árvore de volta, mas sem o progresso.

## 1.7.0

- Aviso no chat quando uma habilidade nova fica disponível (liga/desliga em Gerais).
- Habilidades temporárias por descansos longos ou por data.
- Árvores liberadas por nível, classe ou data do calendário; requisito de data por habilidade.
- Desfazer do mestre na Mesa (15 últimas ações).
- Habilidades compartilhadas entre árvores (Modelos → De outras árvores).
- Verificar e Estatísticas da Skill Tree.
- Guia de boas-vindas e botão **?**.
- Importar por link (GitHub e Gist convertidos sozinhos).
- Treino mais claro: selo no mapa, passos explicados, progresso com barra.
- Barra de desenho horizontal, com paleta de cores suaves.
- Janela dividida em vários arquivos (`app-*.js`, `ui-kit.js`).
- Integração com o Calendário da Mesa para datas.

## 1.6.0

- Grupo **Skill Tree** sempre visível numa faixa do mestre, com Mesa · Atribuir · Editar à direita.
- Escolha de personagem, Atribuir, Recompensa e Grande Feito com cartões de personagem.
- Mesa com cartões por personagem e barras de progresso.
- Temas e cores de status suavizados; brilhos mais leves.

## 1.5.0

- Tipo **Personalizado** totalmente editável: vários recursos e nomes dos campos de custo.
- Removidos poções, digestão, sanidade, atuação e corrupção (antigo modo Sequências). Árvores antigas viram árvores Personalizado com contador "Pontos", mantendo ID, seção, atribuições e progresso.
- Editor de habilidades com campos maiores.
- 6 temas de cor por usuário.
- Interface em inglês quando o Foundry não está em português.

## 1.4.0

- Grandes Feitos por Skill Tree (criar, conceder, retirar).
- Árvores bloqueadas por Grande Feito ou por item, com opção de esconder dos jogadores.

## 1.3.1

- Configurações separadas em **Esta Skill Tree** e **Gerais** (Gerais abre sem árvores).
- Tipos de regra D&D 5e e Personalizado; nome dos pontos automático.
- Ouro aceita Platina (1 PL = 10 PO). Árvores antigas de *Peças de Ouro* passam para Ouro; as de *Peças de Platina* viram Personalizado.
- Exportar todas as Skill Trees; backup oferecido antes de Zerar Árvores.
- Devolução de pontos pendente quando a última árvore é excluída e a página é recarregada.

## 1.3.0

- **Zerar Árvores** com confirmação.
- Excluir seções (movendo ou excluindo as árvores delas).
- O módulo não cria mais uma árvore em branco sozinho.

## 1.2.0

- Gravação serializada e recuperação em caso de falha.
- Operações nas fichas com recuperação (compras, reembolsos, treino).
- Validação de importação (formato, IDs, ciclos, limites de tamanho).
- Verificações de permissão do mestre e do jogador.
- Árvores prontas retiradas do módulo e distribuídas como JSONs separados.
- Seções nomeáveis no lugar das abas fixas.

Detalhes da revisão 1.2.0 estavam em `docs/RELATORIO-1.2.0.md` (removido na 1.11.0).
