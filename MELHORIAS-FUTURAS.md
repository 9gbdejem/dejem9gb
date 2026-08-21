# Melhorias Futuras

## Indicador de alterações em `solicitacoes`

Adicionar um indicador no botão **Atualizar** da página `solicitacoes` quando houver alterações nas solicitações da OPM, mês e ano selecionados.

### Estratégia recomendada

- Criar um nó compacto de versão, por exemplo:

```text
/solicitacoesVersao/{ano}/{mes}/{opm}
```

- Atualizar esse valor sempre que uma solicitação for criada ou alterada.
- Monitorar somente esse nó de versão para a OPM, mês e ano selecionados.
- Fazer o botão **Atualizar** piscar quando a versão mudar.
- Baixar as solicitações completas somente quando o usuário clicar em **Atualizar**.
- Remover o listener anterior ao trocar OPM, mês ou ano.

### Objetivo

Identificar alterações sem baixar continuamente o conteúdo completo de `/solicitacoes`, reduzindo o consumo do Firebase.
