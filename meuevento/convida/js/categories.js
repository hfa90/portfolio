// ============================================================
// CONVIDA — Definição das categorias de evento
// Cada categoria define:
//  - cor padrão do tema
//  - campos do ANFITRIÃO (aparecem no convite, preenchidos na criação)
//  - campos do CONVIDADO (aparecem no formulário de confirmação)
// Isso é o que torna o convite "inteligente": os campos mudam
// sozinhos conforme a categoria escolhida.
// ============================================================

const CATEGORIES = {
  infantil_menino: {
    label: "Aniversário Infantil (Menino)",
    emoji: "🦖",
    color: "#5B9BD5",
    honoreeLabel: "Nome do aniversariante",
    hostFields: [
      { key: "tema_festa", label: "Tema da festa", type: "text", placeholder: "Ex: Dinossauros, Super-heróis..." },
      { key: "idade", label: "Idade que vai completar", type: "number", placeholder: "Ex: 5" },
      { key: "traje", label: "Traje sugerido (opcional)", type: "text", placeholder: "Ex: Fantasia do personagem favorito" },
    ],
    guestFields: [
      { key: "nome_crianca", label: "Nome da criança que vai à festa (se houver)", type: "text" },
      { key: "alergia", label: "Alguma alergia ou restrição alimentar?", type: "text" },
    ],
  },
  infantil_menina: {
    label: "Aniversário Infantil (Menina)",
    emoji: "🎠",
    color: "#E8899C",
    honoreeLabel: "Nome da aniversariante",
    hostFields: [
      { key: "tema_festa", label: "Tema da festa", type: "text", placeholder: "Ex: Princesas, Unicórnios..." },
      { key: "idade", label: "Idade que vai completar", type: "number", placeholder: "Ex: 5" },
      { key: "traje", label: "Traje sugerido (opcional)", type: "text", placeholder: "Ex: Fantasia do personagem favorito" },
    ],
    guestFields: [
      { key: "nome_crianca", label: "Nome da criança que vai à festa (se houver)", type: "text" },
      { key: "alergia", label: "Alguma alergia ou restrição alimentar?", type: "text" },
    ],
  },
  adolescente_15: {
    label: "Debutante / 15 Anos",
    emoji: "👑",
    color: "#C9974B",
    honoreeLabel: "Nome da debutante",
    hostFields: [
      { key: "tema_festa", label: "Tema / conceito da festa", type: "text", placeholder: "Ex: Clássico, Neon, Boho..." },
      { key: "dress_code", label: "Dress code / traje", type: "text", placeholder: "Ex: Traje social, cores em tons pastel" },
      { key: "valsa", label: "Terá valsa ou cerimônia especial?", type: "select", options: ["Sim", "Não"] },
    ],
    guestFields: [
      { key: "seguira_dress_code", label: "Vai seguir o dress code sugerido?", type: "select", options: ["Sim", "Não", "Ainda não sei"] },
      { key: "restricao_alimentar", label: "Restrição alimentar?", type: "text" },
    ],
  },
  aniversario_adulto: {
    label: "Aniversário Adulto",
    emoji: "🥂",
    color: "#4A2545",
    honoreeLabel: "Nome do(a) aniversariante",
    hostFields: [
      { key: "tema_festa", label: "Tema da festa (opcional)", type: "text" },
      { key: "traje", label: "Traje sugerido (opcional)", type: "text" },
    ],
    guestFields: [
      { key: "restricao_alimentar", label: "Restrição alimentar?", type: "text" },
    ],
  },
  aniversario_idoso: {
    label: "Aniversário Melhor Idade",
    emoji: "🌼",
    color: "#A9704F",
    honoreeLabel: "Nome do(a) aniversariante",
    hostFields: [
      { key: "traje", label: "Traje sugerido (opcional)", type: "text" },
      { key: "acessibilidade", label: "Informações de acessibilidade do local", type: "textarea", placeholder: "Ex: Local com rampa de acesso, estacionamento próximo..." },
    ],
    guestFields: [
      { key: "apoio_mobilidade", label: "Precisa de apoio para locomoção?", type: "select", options: ["Não", "Sim"] },
      { key: "restricao_alimentar", label: "Restrição alimentar?", type: "text" },
    ],
  },
  encontro_amigos: {
    label: "Encontro entre Amigos",
    emoji: "🍻",
    color: "#3E8E8E",
    honoreeLabel: "Nome do encontro (opcional)",
    hostFields: [
      { key: "tipo_encontro", label: "Tipo de encontro", type: "text", placeholder: "Ex: Churrasco, Happy hour, Jantar..." },
      { key: "sugestao_contribuicao", label: "Sugestão do que cada um pode levar/pagar", type: "textarea", placeholder: "Ex: Cada um leva uma bebida ou contribui com R$ 30" },
    ],
    guestFields: [
      { key: "forma_contribuicao", label: "Como você vai contribuir?", type: "select", options: ["Vou levar um item", "Vou pagar um valor", "Não vou contribuir"] },
      { key: "o_que_vai_levar", label: "O que você vai levar (se for o caso)", type: "text" },
      { key: "valor_contribuicao", label: "Valor que pretende contribuir, em R$ (se for o caso)", type: "number" },
    ],
  },
  casamento: {
    label: "Casamento",
    emoji: "💍",
    color: "#C9974B",
    honoreeLabel: "Nomes dos noivos",
    hostFields: [
      { key: "local_cerimonia", label: "Local da cerimônia", type: "text" },
      { key: "local_recepcao", label: "Local da recepção", type: "text" },
      { key: "dress_code", label: "Dress code / traje", type: "text", placeholder: "Ex: Traje esporte fino, cores claras" },
    ],
    guestFields: [
      { key: "confirma_para", label: "Confirma presença para", type: "select", options: ["Cerimônia e Recepção", "Somente Recepção", "Somente Cerimônia"] },
      { key: "restricao_alimentar", label: "Restrição alimentar?", type: "text" },
    ],
  },
  outro: {
    label: "Outro Evento",
    emoji: "✨",
    color: "#4A2545",
    honoreeLabel: "Nome do evento / anfitrião",
    hostFields: [
      { key: "descricao_extra", label: "Descrição adicional do evento", type: "textarea" },
    ],
    guestFields: [
      { key: "observacao", label: "Alguma observação?", type: "text" },
    ],
  },
};

// paleta de cores de tema que o anfitrião pode escolher livremente
const THEME_COLORS = ["#4A2545", "#C9974B", "#D98A8E", "#5B9BD5", "#3E8E8E", "#A9704F", "#6F8F6B", "#1B1523"];

function getCategory(key) {
  return CATEGORIES[key] || CATEGORIES.outro;
}
