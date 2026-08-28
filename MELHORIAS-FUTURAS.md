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

## Aprovação das solicitações antes da importação pelo Access

Adicionar aprovação individual para que somente solicitações aprovadas sejam disponibilizadas ao Access por meio de `/SolicPendentes`.

### Estrutura recomendada

Cada solicitação deve possuir uma versão e uma aprovação vinculada exatamente a essa versão:

```text
/solicitacoes/{ID_Firebase}
  versao: 3
  aprovacao:
    status: "aprovada"
    versao: 3
    aprovado_por_re: "156519"
    aprovado_por_nome: "Nome do usuário"
    aprovado_em: timestamp
```

Somente depois da aprovação deve ser criado o marcador:

```text
/SolicPendentes/{ID_Firebase}
  ID_Firebase: "/solicitacoes/..."
  versao_aprovada: 3
  atualizado_em: timestamp
```

### Regras do fluxo

- Cada escala deve ser aprovada individualmente.
- Qualquer usuário com acesso à OPM da escala poderá aprová-la.
- A permissão deverá ser validada pelas regras do Firebase, e não apenas pela interface.
- Ao editar uma escala aprovada, incrementar `versao`, voltar a aprovação para `pendente` e remover somente o marcador correspondente de `/SolicPendentes`.
- Uma escala alterada depois da aprovação deverá exigir nova aprovação.
- A aprovação e a inclusão em `/SolicPendentes` devem ser gravadas de forma atômica.
- O Access deverá importar somente quando `versao_aprovada` for igual à versão atual da solicitação.
- O Access deverá remover de `/SolicPendentes` somente cada item efetivamente importado.
- Solicitações aprovadas durante uma importação em andamento deverão permanecer para a próxima importação.

### Interface sugerida

- Exibir botão **Aprovar** em cada linha pendente.
- Destacar discretamente em vermelho as linhas ainda não aprovadas.
- Exibir o estado **Alterada, requer nova aprovação** quando houver edição posterior.
- Criar um card com a quantidade de escalas aguardando aprovação.
- Exibir um sino no navbar com a quantidade pendente somente das OPMs permitidas ao usuário.

### Escalas vencidas

- Não aprovar automaticamente solicitações cuja data ou horário já tenham passado.
- Marcar essas solicitações como **Expirada sem aprovação**.
- Permitir regularização somente por administrador nível 1, com confirmação e justificativa.

### Objetivo

Impedir a importação de solicitações não conferidas e evitar condições de corrida quando aprovação e edição ocorrerem ao mesmo tempo.
