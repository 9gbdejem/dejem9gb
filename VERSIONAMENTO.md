# Versionamento do Sistema

## Versão atual

**Sistema de Gestão de Escalas - Versão 1.0.1**

O número exibido no Dashboard é a referência oficial da versão entregue aos usuários.

## Convenção

Usar o formato `MAJOR.MINOR.PATCH`:

- `MAJOR`: mudança estrutural, incompatível ou uma nova fase relevante do sistema.
- `MINOR`: conjunto fechado de funcionalidades novas, sem quebrar o uso atual.
- `PATCH`: correção, ajuste de comportamento ou melhoria pequena.

Exemplos: `1.0.1`, `1.1.0` e `2.0.0`.

## Fechamento diário

Durante o desenvolvimento, registrar as alterações em `ALTERACOES-EM-ANDAMENTO.md`.

Ao término de um dia de trabalho, não é necessário criar uma versão se a etapa ainda estiver em teste ou incompleta.

Quando o responsável informar que fará o upload da versão:

1. Resumir todas as alterações registradas em `ALTERACOES-EM-ANDAMENTO.md`.
2. Definir o próximo número da versão.
3. Atualizar este arquivo com o novo histórico.
4. Alterar o texto da versão no Dashboard.
5. Conferir os arquivos modificados com `git status`.
6. Criar o commit da versão e a tag correspondente.
7. Enviar o commit e a tag ao repositório remoto, quando houver conexão configurada.
8. Limpar `ALTERACOES-EM-ANDAMENTO.md` para iniciar a próxima versão.

Modelo de comandos:

```powershell
git add <arquivos-da-versao>
git commit -m "v1.0.1 descricao curta"
git tag -a v1.0.1 -m "Versão 1.0.1"
git push origin main --follow-tags
```

Não criar versão quando a alteração ainda estiver em teste, incompleta ou depender de validação operacional. Nesse caso, registrar a situação em `ALTERACOES-EM-ANDAMENTO.md` e aguardar o fechamento para upload.

## Histórico

### 1.0.1 - 24/09/2026

- Alterado o título do item do navbar de “Dashboard” para “Escalas abertas”.
- Incluído o fluxo de confirmação por documento SEI ou GOV.BR.
- Incluído upload de PDF de confirmação para o Cloudinary em `confirmacoes_presenca`.
- Mantida a compatibilidade com links SEI antigos.
- Corrigida a duplicação de uploads causada por listeners registrados mais de uma vez.
- Corrigida a limpeza do fundo do modal de confirmação.

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
