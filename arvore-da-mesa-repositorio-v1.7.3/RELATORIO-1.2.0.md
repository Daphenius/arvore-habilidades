# Revisão 1.2.0 — 30/10/2026

## Escopo e resultado

Revisão sobre o ZIP 1.1.2 fornecido. Preservados o identificador do módulo, IDs das árvores já salvas, flags existentes, fórmulas de custo e regras de evolução. Não houve acesso nem alteração ao mundo do usuário. Esta entrega é uma versão para validação funcional no Foundry, não uma certificação de ausência de bugs.

O usuário autorizou todas as etapas e ampliou o escopo: retirar conteúdos prontos do módulo, exportar cada árvore em JSON e substituir abas temáticas fixas por seções nomeáveis.

## Alterações por etapa

### 1. Salvamento e fechamento

`persistence.js` foi extraído para serializar gravações, coalescer edições ainda pendentes e reter o conteúdo quando a persistência rejeita a operação. `app.js` usa a mesma fila no autosave de 300 ms, desfazer/refazer, atualização de árvore e fechamento. A janela aguarda a gravação antes de corrigir órfãos; falhas mantêm a janela aberta.

A referência da configuração persistida é comparada antes de gravar. Atualizações remotas não substituem silenciosamente uma edição local pendente. Conflitos exigem exportar e recarregar. O histórico local é reiniciado ao receber dados externos sem edições pendentes. A limpeza no fechamento usa as árvores persistidas, não uma cópia potencialmente antiga do editor.

**Reversão:** restaurar os arquivos 1.1.2. Não houve mudança do formato de `trees`.

### 2. Operações nos personagens

`operations.js` serializa operações no mesmo ator dentro do cliente e registra operações inversas para atualizações de campos, criação, remoção e atualização de documentos embutidos. Compras, reembolsos individuais/totais, limpeza de órfãos, preparo de poção, cancelamento e conclusão de treino usam esse mecanismo. Falha na recuperação produz aviso permanente; não se deve repetir a operação sem conferir a ficha.

`core.js` mantém custos e fórmulas. UUID de item inexistente interrompe a compra em vez de cobrar por uma entrega incompleta. O treino concluído só é removido depois da concessão bem-sucedida. O controle de sinergias passa a ser por ator, evitando que uma verificação de outro personagem seja descartada pelo bloqueio global.

Reembolsos verificam também requisitos explícitos `reqNodes`, inclusive níveis mínimos e referências a outras árvores. Sinergias continuam sendo tratadas pela automação existente. A prévia do reembolso de várias habilidades aplica o mesmo arredondamento por nível usado pelas operações individuais; o anúncio final usa a diferença real dos saldos.

**Reversão:** restaurar o código anterior. Uma reversão de código não desfaz operações já realizadas na ficha; para isso use o backup do mundo.

### 3. Importação e referências

`validation.js` valida todas as árvores do arquivo antes de criar documentos: formato, IDs, duplicatas, conexões inválidas, ciclos nas arestas, dados numéricos, listas e coordenadas de desenhos. Limites: arquivo de 20 MB, até 200 árvores, 10.000 nós por árvore e profundidade de JSON de 50 níveis. Chaves de protótipo são rejeitadas.

Atualização procura a árvore pelo ID antes de preset/nome. Nós são associados pelo ID antes de chave/nome. Cópias e novas importações remapeiam requisitos internos, mantendo referências externas. O histórico de desfazer da interface é zerado ao atualizar uma árvore que também refaz fichas: esse histórico não contém snapshots dos atores.

A escolha de atualizar/criar/cancelar ocorre antes da criação de itens do pacote. A importação só anuncia sucesso após confirmar a gravação. Atualizações de habilidades existentes usam recuperação por ator.

**Reversão:** código anterior; exportação da árvore e backup do mundo para reverter importações já aplicadas.

### 4. Interface, eventos e permissões

Listeners de interação global são removidos em `pointerup`, `pointercancel`, perda de foco, substituição do HTML e fechamento. Uma interação interrompida consolida o movimento/desenho já feito, sem simular clique. Cliques repetidos em ações assíncronas da interface são bloqueados até sua conclusão.

Ações administrativas têm verificação de mestre no dispatcher. Compras e reembolsos verificam propriedade, atribuição e condições administrativas nos fluxos correspondentes. Aprovação de pedidos exige mestre. Isso é defesa do fluxo normal: proprietários de atores continuam tendo as permissões de edição que o Foundry lhes concede.

IDs e coordenadas nos pontos de saída SVG revistos são escapados/convertidos. Descrições continuam usando o enriquecimento nativo existente. Não se classificou todo `innerHTML` como vulnerável. Não foi feita uma prova exaustiva de segurança de todo HTML enriquecido e de todos os módulos externos.

Migrações antigas são restritas ao mestre ativo. Formatos e marcadores existentes são preservados. O avanço automático de treino em descanso é executado pelo mestre ativo; sem mestre ativo, permanece a opção de avançar o treino depois pelo mestre.

### 5. Conteúdo externo e seções

Removidos do pacote do módulo `scripts/presets.js` e a pasta `arvores/`. Removidos os imports, botões e criação automática do catálogo. A API pública deixa de expor `presets`; macros pessoais que chamavam esse catálogo precisam usar importação de JSON. `open`, `openFor`, `trees` e `fixPoints` continuam disponíveis.

O pacote separado contém 33 JSONs de árvores: 22 caminhos, 5 presets e 6 árvores dos arquivos extras. Duas árvores extras têm o mesmo nome das variantes de presets; ambas foram preservadas com prefixos distintos. Não são removidos conteúdos que já estejam salvos no mundo.

Adicionada a configuração `arvore-habilidades.sections` com `{list:[{id,name}]}`. Uma árvore pode ter o campo adicional `section`. Árvores antigas sem esse campo são agrupadas em Fantasia ou Sequências conforme seu modo; não há migração destrutiva. O botão + cria seções, o lápis renomeia e a configuração da árvore permite mover entre seções. O modo de regra continua independente da organização.

Versão e referências de cache foram atualizadas em conjunto para 1.2.0. O CSS recebeu apenas suporte à quebra de linha das seções e retirada da regra visual exclusiva da antiga aba LOTD.

**Reversão:** 1.1.2 ignora o campo `section` e a configuração adicional; os dados continuam disponíveis. O catálogo embutido voltará se o código antigo for restaurado.

## Inventário de persistência

- `game.settings`, escopo do módulo: trees, templates, presets (legado), session, configurações gerais, migrated, keysMigrated, refundMigrated; adicionada sections.
- `flags.world` dos atores: skillTree, skillRanks, skillLog, skillReq, skillTraining, milestones, skillPoints, mythic e lotd.
- Recursos numéricos configuráveis da ficha e moedas GP/PP.
- Itens e ActiveEffects: flags de vínculo skillTree, poções e estados de transformação.
- Tokens: aparência/tamanho/luz/tintura alterados por automações existentes.
- Memória: histórico de até 60 snapshots, seleção, desenhos em andamento e filas.

Não foram renomeadas flags de sequências: retirar a palavra LOTD da organização visual não pode apagar ou renomear identificadores persistidos de personagens.

## Evidência e testes executados

Node.js: verificação sintática dos seis arquivos JavaScript do módulo e resolução de imports locais. Os JSONs individuais são válidos e passaram pela validação de árvores. O manifesto e o arquivo CSS usam a mesma versão.

22 testes automatizados aprovados com APIs/documentos simulados:

1. Serialização de gravações e preservação da última edição.
2. Falha de gravação retém snapshot e permite nova tentativa.
3. Validação dos 33 JSONs exportados.
4. Rejeição de IDs inválidos/repetidos, ciclos e coordenadas malformadas.
5. Remapeamento de requisitos internos sem alterar referências externas.
6. Seções de árvores antigas preservam identidade e modo.
7. Falha de compra recupera pontos e progresso.
8. Compra e reembolso bem-sucedidos preservam valores.
9. Compras simultâneas no mesmo cliente respeitam nível máximo.
10. Falha de reembolso restaura item removido e nível.
11. Falha na conclusão de treino preserva pagamento e treinamento.
12. Jogador não concede habilidade grátis nem ignora aprovação pelo fluxo de compra.
13. Fechamento espera gravação em andamento.
14. Falha ao fechar preserva a edição na janela.
15. Escape/conversão dos campos SVG testados.
16. Interação de ponteiro repassa evento e remove listeners.
17. HTML da interface inclui seções personalizadas e não inclui o catálogo; salvar/desfazer/refazer funcionam no teste.
18. Nó renomeado mantém ID na atualização importada.
19. Criação/renomeação de seção mantém IDs das árvores.
20. Editor desatualizado não sobrescreve uma alteração já observável no mundo.
21. Prévia de reembolso respeita arredondamento por nível.
22. Reembolso não quebra um pré-requisito explícito entre árvores.

A recuperação pode deixar objetos vazios em flags após remover chaves recém-criadas. Os testes verificam saldo, nível, desbloqueios e histórico; esses objetos vazios não significam compra ou gasto remanescente.

## Limitações e riscos remanescentes

- **Concorrência entre clientes — provável, não eliminada:** a fila por ator é local. Dois computadores podem alterar o mesmo ator ao mesmo tempo. O controle de conflitos das árvores verifica estado observado, mas não é compare-and-swap no servidor. Uma solução distribuída exige protocolo de autoridade e validação de mensagens; não foi apresentada como resolvida.
- **Queda total durante operações — risco residual:** a recuperação depende do cliente continuar executando e de o servidor aceitar as operações inversas. Não é uma transação de banco de dados.
- **Efeitos externos — fora da recuperação integral:** mensagens já enviadas, rolagens, hooks de terceiros e alterações em tokens feitas por esses hooks não são revertidos universalmente. Validar transformações no Foundry.
- **Importações com vários atores/itens de mundo — recuperação parcial:** recuperação é por ator; uma atualização que falhe pode deixar a árvore nova gravada e alguns atores já atualizados. Itens/pastas de mundo importados podem permanecer se uma etapa posterior falhar. Use o backup para reversão completa; não repita indiscriminadamente uma importação que falhou.
- **Recursos históricos de árvores excluídas:** versões antigas não registram sempre o caminho do recurso original junto de cada pagamento. O fallback legado da limpeza de órfãos foi mantido; reembolsos de árvore excluída com recurso personalizado precisam de conferência manual.
- **Desempenho:** não houve medição dentro do Foundry com árvores grandes. O limite de 60 snapshots e a serialização completa foram mantidos; arquivo grande, isoladamente, não motivou reescrita.
- **Compatibilidade de runtime:** ApplicationV2, documentos embutidos, atualização com keepId e integrações com dnd5e/Tidy precisam ser testados na instalação real. A consulta externa à documentação não retornou conteúdo nesta execução. O manifesto conserva as referências do pacote recebido, sem alegar nova certificação.
- **Macros externas de presets:** a API `presets` foi retirada como parte da extração autorizada do conteúdo.

## Roteiro de validação em uma cópia do mundo

1. Antes da troca, registrar árvores, atribuições, pontos, níveis e itens de dois personagens; fazer backup com o mundo fechado.
2. Atualizar substituindo a pasta inteira, reiniciar e recarregar. Conferir árvores antigas e saldo, sem importá-las novamente.
3. Criar seção, renomeá-la, mover árvore e reabrir a janela. Entrar como jogador e conferir visibilidade por personagem.
4. Importar uma árvore vazia/pequena, um preset externo e um caminho de sequência. Conferir imagens, descrições e habilidades.
5. Comprar, aumentar nível, reembolsar parcialmente e reembolsar várias habilidades; comparar moedas, recurso e efeitos. Testar um requisito entre árvores.
6. Começar treino, avançar descanso, concluir e cancelar; testar poção, digestão e transformações.
7. Alterar árvore e fechar rapidamente; desfazer/refazer; cancelar arrasto/desenho, perder foco e fechar durante interação.
8. Atualizar JSON mantendo ID de nó mas mudando nome; verificar progresso e itens. Testar rejeição de JSON inválido sem criação de documentos.
9. Testar dois clientes em uma cópia descartável, anotando separadamente concorrência de editor e de compras. Não assumir que a fila local serializa computadores distintos.
10. Em falha persistente, parar operações, guardar logs, restaurar backup. Não utilizar o mundo principal para provocar falhas de persistência.

## Melhorias adiadas

Templates separados para a interface, extração completa das regras D&D e persistência incremental. Não são necessários para separar o conteúdo pronto. Compatibilidade com outros sistemas continua fora do escopo.
