# Histórico de versões — Árvore da Mesa

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

Detalhes da revisão 1.2.0 em `RELATORIO-1.2.0.md`.
