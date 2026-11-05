# Alterações em Andamento

Este documento reúne tudo o que for desenvolvido após a última versão publicada.

As alterações devem ser registradas aqui durante o trabalho, mesmo quando ainda estiverem em teste.

## Próxima versão

Ainda não definida.

## Alterações

<!-- Registrar abaixo cada alteração concluída ou em teste. -->

- Incluída, após a baixa de IDs no Access, a verificação das escalas filtradas com `Status_Adm = 3` e `ID_Escala` vazio, permitindo ao usuário alterar somente o status dessas escalas para `1` e encaminhá-las novamente ao fluxo de cadastro na Intranet.
- Corrigido o envio dos escalados pelo Access ao Firebase: as chaves de `ID_Escala` e `Militar_RE` agora são normalizadas, os identificadores são serializados como texto JSON, caracteres de controle são escapados, horários inteiros são enviados sem separador decimal inválido e o `PATCH` envia somente os registros pendentes, preservando os dados já existentes sem baixar e remontar todo o nó do dia.

- Corrigida a atualização da página `Escalas`: o botão `Atualizar` agora invalida somente o cache do dia selecionado antes de consultar novamente o Firebase.

## Pendências e observações

<!-- Registrar aqui o que ainda depende de teste, validação ou decisão. -->

## Fechamento para upload

Quando o responsável informar que fará o upload:

1. Resumir as alterações deste documento.
2. Definir o próximo número da versão conforme MAJOR.MINOR.PATCH.
3. Atualizar o histórico em `VERSIONAMENTO.md`.
4. Atualizar a versão exibida no Dashboard.
5. Criar o commit e a tag da versão.
6. Limpar este documento, mantendo apenas o modelo vazio para a próxima versão.
