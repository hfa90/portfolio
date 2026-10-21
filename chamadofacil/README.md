# Chamado Fácil · CD-AM (RD Saúde / Drogasil)

Sistema web para a supervisão do CD-AM:

1. **Chamados rápidos** — reset de senha do Teams (mesma senha do Gente Mobile e Universidade RD) e WMS Manhattan (reset, criação de acesso, desbloqueio). O supervisor escolhe o colaborador, o texto do chamado é gerado e copiado, e o ServiceNow abre direto no formulário certo. Cada chamado fica registrado com o número RITM e o status.
2. **Inventário de coletores** — cards com QR code, status (disponível / em uso / manutenção / inativo), propriedade (do CD ou alugado + locadora), equipe e supervisor responsável, quem está com o coletor e há quanto tempo. Cadastro individual ou em lote, edição, exclusão e etiquetas QR para impressão.
3. **Terminal de bipagem** — um PC ou tablet perto do armário de coletores. O colaborador bipa o crachá (matrícula) e o QR do coletor, em qualquer ordem: o sistema decide se é retirada ou devolução, registra a matrícula, o nome e o turno, e o supervisor é **notificado na hora**. Se o coletor estiver com outra pessoa, o terminal oferece a transferência.
4. **Histórico** — todas as movimentações por dia, semana, mês ou período, com filtros, gráfico por hora/dia, resumo por turno, ranking e exportação para CSV (Excel).

Site estático (HTML + CSS + JavaScript puro), sem build. O banco é o Supabase.

```
chamadofacil/
├── index.html        login (matrícula + CPF)
├── app.html          painel do supervisor (chamados, coletores, histórico, equipe)
├── terminal.html     terminal de bipagem (retirada / devolução)
├── etiquetas.html    impressão de etiquetas QR (coletores e crachás)
├── css/style.css
├── js/config.js      URL e chave do Supabase, links do ServiceNow, turnos
├── js/common.js · js/app.js · js/terminal.js
├── sql/01_schema.sql tabelas, segurança (RLS), funções e tempo real
└── sql/privado/      ⚠️ NÃO vai para o GitHub (dados de funcionários e CPFs)
    ├── 02_colaboradores.sql          carga da listagem WorkArea
    └── 03_acessos_supervisores.sql   cria o login dos supervisores
```

## Instalação (uma vez)

No Supabase do projeto, abra **SQL Editor** e rode, nesta ordem:

1. `sql/01_schema.sql`
2. `sql/privado/02_colaboradores.sql` (carga dos 107 colaboradores do CD-AM)
3. `sql/privado/03_acessos_supervisores.sql`: **preencha antes o CPF de cada supervisor/coordenador** no lugar de `CPF_AQUI` (a planilha WorkArea não traz CPF).

Pronto. O login é **matrícula** como usuário e **CPF (só números)** como senha. Cada supervisor pode trocar a senha em *Minha conta*. Para voltar a senha de alguém ao CPF, rode de novo a linha dele no arquivo 03.

> Em **Authentication → Providers → Email**, deixe o provedor Email habilitado. Os usuários são criados já confirmados pelo script, então não precisa de e-mail real.

## Como usar no dia a dia

**Cadastrar coletores:** *Coletores → Em lote* (ex.: 1 a 40), escolha modelo, se é do CD ou alugado, equipe e supervisor. No fim o sistema oferece imprimir as etiquetas (70 × 35 mm, cabem em etiqueta adesiva ou papel comum). Cole a etiqueta atrás de cada aparelho.

**Terminal:** em um PC/tablet com leitor de código de barras USB ou Bluetooth (modo teclado), um supervisor faz login e abre *Terminal de bipagem*. O terminal continua logado. O leitor envia o código e um Enter. Sem leitor dá para digitar ou usar a câmera (botão *Usar câmera*).
- Crachá: matrícula em código de barras/QR, ou digitada. Em *Equipe → Crachás QR* dá para imprimir um QR de matrícula para cada colaborador.
- Coletor: QR da etiqueta (`COL-012`). Digitar só `12` também funciona.

**Notificações:** com o painel aberto (aba do navegador ou app instalado), cada retirada ou devolução dos coletores da sua equipe aparece na hora com aviso e som. Clique no sino → *Ativar alertas* para receber a notificação do sistema mesmo com a aba em segundo plano. Coordenadores recebem de todas as equipes.

**Coletor não devolvido:** fica com borda vermelha e entra no contador *Não devolvidos* quando passa de `HORAS_ALERTA` horas (padrão 9 h, em `js/config.js`).

## Ajustes

- **Turnos:** `TURNOS` em `js/config.js` **e** a função `turno_atual()` em `01_schema.sql` (padrão T1 06:00–14:20, T2 14:20–22:40, T3 22:40–06:00, horário de Manaus). Se o colaborador tiver turno fixo cadastrado em *Equipe*, ele é usado na movimentação.
- **Links do ServiceNow:** `LINKS` em `js/config.js`.
- **Atualizar funcionários:** *Equipe → Importar WorkArea* com a planilha nova (.xlsx). Quem já existe é atualizado e os novos são incluídos. Há uma opção para inativar quem saiu.

## Segurança

- A *anon key* é pública por natureza. Quem protege os dados são as políticas **RLS**: sem login de supervisor/coordenador nada é lido nem gravado.
- Movimentações só entram pela função `registrar_bipagem` (transacional, com bloqueio de linha). Ninguém edita o histórico pelo app.
- `criar_acesso` só pode ser executada no SQL Editor (não fica exposta na API).
- O perfil (supervisor/coordenador) não pode ser alterado pelo app.
- CPFs **não** ficam em nenhuma tabela: só existem como hash da senha no Supabase Auth.
