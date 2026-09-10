# Versionamento do Sistema

## Versão atual

**Sistema de Gestão de Escalas - Versão 1.0.0**

O número exibido no Dashboard é a referência oficial da versão entregue aos usuários.

## Convenção

Usar o formato `MAJOR.MINOR.PATCH`:

- `MAJOR`: mudança estrutural, incompatível ou uma nova fase relevante do sistema.
- `MINOR`: conjunto fechado de funcionalidades novas, sem quebrar o uso atual.
- `PATCH`: correção, ajuste de comportamento ou melhoria pequena.

Exemplos: `1.0.1`, `1.1.0` e `2.0.0`.

## Fechamento diário

Ao término de um dia de trabalho, quando não houver uma funcionalidade importante incompleta:

1. Atualizar este arquivo com as alterações concluídas.
2. Alterar o texto da versão no Dashboard, quando o número mudar.
3. Conferir os arquivos modificados com `git status`.
4. Criar o commit da versão e a tag correspondente.
5. Enviar o commit e a tag ao repositório remoto, quando houver conexão configurada.

Modelo de comandos:

```powershell
git add <arquivos-da-versao>
git commit -m "v1.0.1 descricao curta"
git tag -a v1.0.1 -m "Versão 1.0.1"
git push origin main --follow-tags
```

Não criar versão quando a alteração ainda estiver em teste, incompleta ou depender de validação operacional. Nesse caso, registrar a situação como "em andamento" e fechar somente quando a etapa estiver concluída.

## Histórico

### 1.0.0 - 04/09/2026

Marco inicial formal de versionamento do Sistema de Gestão de Escalas.

- Gestão de solicitações integrada ao Firebase e ao Access.
- Dashboard de escalas abertas e filtros operacionais.
- Confirmação, montagem, pagamento e tratamento de novidades de escalas.
- Perfis, permissões, moderadores e acessos temporários.
- A página oficial de solicitações concentra o fluxo validado durante a fase de testes.
- Notificações globais no navbar para pendências de importação e solicitações de liberação.

## Em andamento

- Encerramento da fase de testes da página de solicitações e transporte para a página oficial.
- Ajustes pendentes no Access devem ser versionados em um fechamento próprio, após testes.
