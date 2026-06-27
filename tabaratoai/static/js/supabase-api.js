(function () {
  "use strict";

  const originalFetch = window.fetch.bind(window);
  const cfg = window.TBA_SUPABASE_CONFIG || {};
  const hasConfig = Boolean(cfg.url && cfg.anonKey && window.supabase);
  const client = hasConfig ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  const bucket = cfg.storageBucket || "uploads";

  window.TBA_SUPABASE = client;

  function response(payload, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" }
    }));
  }

  function notConfigured() {
    return response({
      success: false,
      message: "Supabase nao configurado. Preencha static/js/supabase-config.js com Project URL e anon key."
    }, 503);
  }

  function unsupported(name) {
    return response({
      success: false,
      message: `${name} era uma funcao de servidor Python. Migre para Supabase Edge Function ou API externa em JavaScript.`
    }, 501);
  }

  async function readJson(init) {
    if (!init || !init.body) return {};
    if (typeof init.body === "string") return JSON.parse(init.body || "{}");
    if (init.body instanceof FormData) return init.body;
    return {};
  }

  async function currentUser() {
    const { data } = await client.auth.getUser();
    return data.user || null;
  }

  async function currentProfile() {
    const user = await currentUser();
    if (!user) return null;
    const { data } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) return { ...data, user };

    const metadata = user.user_metadata || {};
    const nome = metadata.full_name || metadata.name || user.email || "Usuário";
    const profile = {
      id: user.id,
      nome,
      email: user.email || null,
      telefone: metadata.phone || null
    };
    await client.from("profiles").upsert(profile, { onConflict: "id" });
    return { ...profile, user };
  }

  function normalizeProduct(row) {
    const precos = row.precos || [];
    const valid = precos.filter((p) => Number(p.preco) > 0);
    const best = valid.slice().sort((a, b) => Number(a.preco) - Number(b.preco))[0];
    return {
      id: row.id,
      nome: row.nome,
      categoria: row.categoria,
      marca: row.marca,
      codigo_barras: row.codigo_barras,
      imagem: row.imagem_url || row.imagem || "https://via.placeholder.com/300x220?text=Produto",
      unidade: row.unidade || "un",
      preco_minimo: best ? Number(best.preco) : 0,
      mercado_nome: best && best.supermercados ? best.supermercados.nome : "Indisponivel",
      comparacao: valid.map((p) => ({
        id: p.id,
        produto_id: row.id,
        supermercado_id: p.supermercado_id,
        mercado_nome: p.supermercados ? p.supermercados.nome : "Mercado",
        mercado_logo: p.supermercados ? p.supermercados.logo_url : null,
        preco: Number(p.preco),
        atualizado_em: p.atualizado_em
      }))
    };
  }

  async function getProducts(params) {
    let query = client
      .from("produtos")
      .select("*, precos(id, preco, supermercado_id, atualizado_em, supermercados(id, nome, rede, logo_url))")
      .eq("ativo", true);

    const busca = params.get("busca") || params.get("termo");
    if (busca) query = query.ilike("nome", `%${busca}%`);

    const { data, error } = await query.limit(80);
    if (error) throw error;

    let produtos = (data || []).map(normalizeProduct);
    const ordem = params.get("ordenacao");
    if (ordem === "nome") produtos.sort((a, b) => a.nome.localeCompare(b.nome));
    else produtos.sort((a, b) => (a.preco_minimo || 999999) - (b.preco_minimo || 999999));

    return response({ success: true, produtos });
  }

  async function getProductsBatch(params) {
    const ids = (params.get("ids") || "").split(",").map((id) => Number(id)).filter(Boolean);
    if (!ids.length) return response({ success: false, produtos: [] }, 400);
    const { data, error } = await client
      .from("produtos")
      .select("*, precos(id, preco, supermercado_id, atualizado_em, supermercados(id, nome, rede, logo_url))")
      .in("id", ids);
    if (error) throw error;
    return response({ success: true, produtos: (data || []).map(normalizeProduct) });
  }

  async function getProduct(id) {
    const { data, error } = await client
      .from("produtos")
      .select("*, precos(id, preco, supermercado_id, atualizado_em, supermercados(id, nome, rede, logo_url))")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return response({ success: false }, 404);
    return response({ success: true, produto: normalizeProduct(data) });
  }

  async function searchProducts(params) {
    const termo = params.get("termo") || "";
    const { data, error } = await client
      .from("produtos")
      .select("*, precos(id, preco, supermercado_id, supermercados(id, nome))")
      .ilike("nome", `%${termo}%`)
      .limit(12);
    if (error) throw error;
    const sugestoes = (data || []).map(normalizeProduct).map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco_minimo,
      mercado_nome: p.mercado_nome,
      imagem: p.imagem
    }));
    return response({ success: true, sugestoes });
  }

  async function checkProduct(params) {
    const barcode = params.get("barcode") || params.get("codigo");
    if (!barcode) return response({ success: false, message: "Codigo nao fornecido" }, 400);
    const { data, error } = await client
      .from("produtos")
      .select("*, precos(id, preco, supermercado_id, supermercados(id, nome))")
      .eq("codigo_barras", barcode)
      .maybeSingle();
    if (error) throw error;
    if (!data) return response({ success: true, exists: false });
    return response({ success: true, exists: true, product: normalizeProduct(data) });
  }

  async function publicSupermarkets() {
    const { data, error } = await client.from("supermercados").select("*").eq("ativo", true).order("nome");
    if (error) throw error;
    const redes = {};
    (data || []).forEach((m) => {
      const key = m.rede || m.nome;
      if (!redes[key]) redes[key] = {
        id: m.id,
        nome: key,
        logo_url: m.logo_url,
        ids_filiais: [],
        filiais: []
      };
      redes[key].ids_filiais.push(m.id);
      redes[key].filiais.push(m);
    });
    return response({ success: true, data: Object.values(redes), supermercados: data || [] });
  }

  async function login(init) {
    const body = await readJson(init);
    const telefone = String(body.telefone || "").replace(/\D/g, "");
    let email = body.email;
    if (!email && telefone) {
      const { data } = await client.from("profiles").select("email").eq("telefone", telefone).maybeSingle();
      email = data && data.email;
    }
    if (!email) return response({ success: false, message: "Informe um email cadastrado para entrar." }, 401);
    const { error } = await client.auth.signInWithPassword({ email, password: body.senha || body.password });
    if (error) return response({ success: false, message: error.message }, 401);
    const profile = await currentProfile();
    return response({ success: true, redirect_url: profile && profile.role === "admin" ? "administrativo.html" : "compareaqui.html" });
  }

  async function register(init) {
    const body = await readJson(init);
    const email = body.email;
    const password = body.senha || body.password;
    if (!email || !password) return response({ success: false, message: "Email e senha sao obrigatorios." }, 400);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { nome: body.nome, telefone: body.telefone } }
    });
    if (error) return response({ success: false, message: error.message }, 400);
    if (data.user) {
      await client.from("profiles").upsert({
        id: data.user.id,
        nome: body.nome,
        email,
        telefone: body.telefone,
        endereco: body.endereco,
        device_id: body.device_id
      });
    }
    return response({ success: true, message: "Conta criada. Confirme o email se o Supabase solicitar." });
  }

  async function userInfo() {
    const profile = await currentProfile();
    if (!profile) return response({ success: false });
    return response({ success: true, usuario: { id: profile.id, nome: profile.nome, email: profile.email, role: profile.role } });
  }

  async function profileData(init) {
    const profile = await currentProfile();
    if (!profile) return response({ success: false, message: "Usuario nao logado" }, 401);
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET") return response({ success: true, usuario: profile, estatisticas: { posts: 0, listas: 0, pontos: profile.pontos || 0 } });
    const body = await readJson(init);
    const { error } = await client.from("profiles").update(body).eq("id", profile.id);
    if (error) throw error;
    return response({ success: true, message: "Perfil atualizado!" });
  }

  async function logout() {
    await client.auth.signOut();
    location.href = "login.html";
    return response({ success: true });
  }

  async function saveList(init) {
    const profile = await currentProfile();
    if (!profile) return response({ success: false, message: "Login necessario" }, 401);
    const body = await readJson(init);
    const itens = body.itens || body.items || body.lista || [];
    const total = body.total || itens.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.quantidade || 1), 0);
    const { data, error } = await client.from("listas").insert({
      user_id: profile.id,
      nome: body.nome || "Minha lista",
      total
    }).select("id").single();
    if (error) throw error;
    if (itens.length) {
      const rows = itens.map((item) => ({
        lista_id: data.id,
        produto_id: item.id || item.produto_id || null,
        nome: item.nome,
        quantidade: item.quantidade || 1,
        preco: item.preco || 0,
        mercado_nome: item.mercado_nome || item.mercado || null,
        imagem_url: item.imagem || null
      }));
      const inserted = await client.from("lista_itens").insert(rows);
      if (inserted.error) throw inserted.error;
    }
    return response({ success: true, id: data.id });
  }

  async function myLists() {
    const profile = await currentProfile();
    if (!profile) return response({ success: false }, 401);
    const { data, error } = await client.from("listas").select("*, lista_itens(*)").eq("user_id", profile.id).order("created_at", { ascending: false });
    if (error) throw error;
    return response({ success: true, listas: data || [] });
  }

  async function listDetail(id) {
    const profile = await currentProfile();
    if (!profile) return response({ success: false }, 401);
    const { data, error } = await client.from("listas").select("*, lista_itens(*)").eq("id", id).eq("user_id", profile.id).maybeSingle();
    if (error) throw error;
    if (!data) return response({ success: false, message: "Lista nao encontrada" }, 404);
    return response({ success: true, lista: { ...data, itens: data.lista_itens || [] } });
  }

  async function deleteList(id) {
    const profile = await currentProfile();
    if (!profile) return response({ success: false }, 401);
    const { error } = await client.from("listas").delete().eq("id", id).eq("user_id", profile.id);
    if (error) throw error;
    return response({ success: true });
  }

  async function listStats() {
    const profile = await currentProfile();
    if (!profile) return response({ success: false }, 401);
    const { data, error } = await client.from("listas").select("total, created_at").eq("user_id", profile.id);
    if (error) throw error;
    const total = (data || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
    return response({ success: true, stats: { total_listas: data.length, total_economizado: 0, gasto_total: total } });
  }

  async function historyData() {
    const { data, error } = await client
      .from("precos")
      .select("*, produtos(nome, imagem_url), supermercados(nome)")
      .order("atualizado_em", { ascending: false })
      .limit(80);
    if (error) throw error;
    const historico = (data || []).map((p) => ({
      produto_id: p.produto_id,
      nome: p.produtos ? p.produtos.nome : "Produto",
      mercado_nome: p.supermercados ? p.supermercados.nome : "Mercado",
      preco: Number(p.preco),
      preco_anterior: Number(p.preco_anterior || p.preco),
      status: Number(p.preco) < Number(p.preco_anterior || p.preco) ? "baixou" : "estavel",
      imagem: p.produtos ? p.produtos.imagem_url : null
    }));
    return response({ success: true, oportunidades: historico.filter((i) => i.status === "baixou").slice(0, 8), historico });
  }

  async function publicNotices() {
    const { data, error } = await client.from("avisos").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return response({ success: true, avisos: data || [] });
  }

  async function validatePrice(init) {
    const profile = await currentProfile();
    if (!profile) return response({ success: false, message: "Faca login para votar." }, 401);
    const body = await readJson(init);
    let payload = {};
    if (body instanceof FormData) {
      payload = Object.fromEntries(body.entries());
      const file = body.get("foto");
      if (file && file.name) {
        const path = `validacoes/${profile.id}/${Date.now()}-${file.name}`;
        const uploaded = await client.storage.from(bucket).upload(path, file, { upsert: true });
        if (!uploaded.error) payload.foto_url = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
    } else {
      payload = body;
    }
    const { error } = await client.from("validacoes_preco").insert({
      user_id: profile.id,
      preco_id: Number(payload.preco_id),
      tipo: payload.tipo || "report",
      preco_sugerido: payload.preco_sugerido ? Number(payload.preco_sugerido) : null,
      foto_url: payload.foto_url || null
    });
    if (error) throw error;
    return response({ success: true, message: "Obrigado pela colaboracao!" });
  }

  async function adminStats() {
    const [produtos, mercados, usuarios] = await Promise.all([
      client.from("produtos").select("id", { count: "exact", head: true }),
      client.from("supermercados").select("id", { count: "exact", head: true }),
      client.from("profiles").select("id", { count: "exact", head: true })
    ]);
    return response({ success: true, stats: { produtos: produtos.count || 0, mercados: mercados.count || 0, usuarios: usuarios.count || 0 } });
  }

  async function adminCatalog() {
    const { data, error } = await client.from("produtos").select("*").order("nome");
    if (error) throw error;
    return response({ success: true, produtos: data || [] });
  }

  async function adminUsers() {
    const { data, error } = await client.from("profiles").select("id, nome, email, telefone, pontos, role").order("nome");
    if (error) throw error;
    return response({ success: true, usuarios: data || [] });
  }

  async function adminUpdatePoints(init) {
    const body = await readJson(init);
    const { error } = await client.from("profiles").update({ pontos: Number(body.pontos || 0) }).eq("id", body.usuario_id || body.id);
    if (error) throw error;
    return response({ success: true });
  }

  async function adminNotices() {
    const { data, error } = await client.from("avisos").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return response({ success: true, avisos: data || [] });
  }

  async function adminSendNotice(init) {
    const body = await readJson(init);
    const { error } = await client.from("avisos").insert({
      titulo: body.titulo || "Aviso",
      mensagem: body.mensagem || body.texto || "",
      tipo: body.tipo || "info",
      ativo: body.ativo !== false
    });
    if (error) throw error;
    return response({ success: true });
  }

  async function saveCatalog(init) {
    const body = await readJson(init);
    const row = {
      id: body.id || undefined,
      nome: body.nome,
      categoria: body.categoria,
      marca: body.marca,
      unidade: body.unidade,
      codigo_barras: body.codigo_barras || body.barcode,
      imagem_url: body.imagem_url || body.imagem,
      ativo: body.ativo !== false
    };
    const { data, error } = await client.from("produtos").upsert(row).select().single();
    if (error) throw error;
    return response({ success: true, produto: data, message: "Produto salvo com sucesso!" });
  }

  async function saveMarket(init) {
    const body = await readJson(init);
    const row = {
      id: body.id || undefined,
      nome: body.nome,
      rede: body.rede || body.nome,
      cidade: body.cidade,
      estado: body.estado,
      endereco: body.endereco,
      latitude: body.lat || body.latitude,
      longitude: body.lon || body.longitude,
      logo_url: body.logo_url,
      ativo: body.ativo !== false
    };
    const { data, error } = await client.from("supermercados").upsert(row).select().single();
    if (error) throw error;
    return response({ success: true, mercado: data, lat: data.latitude, lon: data.longitude });
  }

  async function saveMarketProduct(init) {
    const body = await readJson(init);
    const { error } = await client.from("precos").upsert({
      produto_id: Number(body.produto_id),
      supermercado_id: Number(body.mercado_id || body.supermercado_id),
      preco: Number(body.preco),
      atualizado_em: new Date().toISOString()
    }, { onConflict: "produto_id,supermercado_id" });
    if (error) throw error;
    return response({ success: true });
  }

  async function marketPrices(id) {
    const { data, error } = await client
      .from("precos")
      .select("*, produtos(id, nome, imagem_url)")
      .eq("supermercado_id", id)
      .order("atualizado_em", { ascending: false });
    if (error) throw error;
    const precos = (data || []).map((p) => ({ ...p, produto_id: p.produto_id, nome: p.produtos ? p.produtos.nome : "Produto" }));
    return response({ success: true, precos });
  }

  async function route(url, init) {
    if (!client) return notConfigured();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const params = url.searchParams;
    const method = (init.method || "GET").toUpperCase();

    if (path === "/api/login" && method === "POST") return login(init);
    if (path === "/api/cadastrar-usuario" && method === "POST") return register(init);
    if (path === "/api/logout") return logout();
    if (path === "/api/usuario-info") return userInfo();
    if (path === "/api/perfil/dados") return profileData(init);
    if (path === "/api/meus-dispositivos") return response({ success: true, devices: JSON.parse(localStorage.getItem("tbl_devices") || "[]") });
    if (path === "/api/remover-dispositivo") return response({ success: true });
    if (path === "/api/telegram-login") return unsupported("Login social legado");
    if (path === "/api/gerar-senha") return unsupported("Recuperacao de senha por telefone");

    if (path === "/api/produtos") return getProducts(params);
    if (path === "/api/produtos-em-lote") return getProductsBatch(params);
    if (path.startsWith("/api/produto/")) return getProduct(Number(path.split("/").pop()));
    if (path === "/api/buscar-produtos") return searchProducts(params);
    if (path === "/api/check-product") return checkProduct(params);
    if (path === "/api/public/supermercados" || path === "/api/vibeconecta/supermercados") return publicSupermarkets();
    if (path === "/api/dados-historico") return historyData();
    if (path === "/api/public/avisos") return publicNotices();
    if (path === "/api/validar-preco" && method === "POST") return validatePrice(init);
    if (path === "/api/notificacao-inteligente") return response({ success: false, message: "Sem variacoes relevantes" });
    if (path === "/api/ofertas-tinder") {
      const products = await getProducts(new URLSearchParams("ordenacao=menor-preco"));
      const json = await products.json();
      return response({ success: true, ofertas: (json.produtos || []).slice(0, 12) });
    }

    if (path === "/api/salvar-lista" && method === "POST") return saveList(init);
    if (path === "/api/minhas-listas") return myLists();
    if (path.startsWith("/api/lista/")) return listDetail(Number(path.split("/").pop()));
    if (path.startsWith("/api/excluir-lista/")) return deleteList(Number(path.split("/").pop()));
    if (path === "/api/estatisticas-listas") return listStats();

    if (path === "/api/admin/stats" || path === "/api/admin/db-status") return path.endsWith("db-status") ? response({ success: true, status: "online" }) : adminStats();
    if (path === "/api/admin/mercados/listar") return publicSupermarkets().then(async (r) => {
      const json = await r.json();
      return response({ success: true, mercados: json.supermercados || [] });
    });
    if (path === "/api/admin/catalogo") return adminCatalog();
    if (path === "/api/admin/catalogo/salvar" && method === "POST") return saveCatalog(init);
    if (path === "/api/admin/mercado/salvar" && method === "POST") return saveMarket(init);
    if (path === "/api/admin/mercado/vincular-produto" && method === "POST") return saveMarketProduct(init);
    if (path.match(/^\/api\/admin\/mercado\/\d+\/precos$/)) return marketPrices(Number(path.split("/")[4]));
    if (path.match(/^\/api\/admin\/supermercados\/\d+\/filiais$/)) return publicSupermarkets();
    if (path === "/api/admin/usuarios/listar") return adminUsers();
    if (path === "/api/admin/usuarios/atualizar-pontos" && method === "POST") return adminUpdatePoints(init);
    if (path === "/api/admin/avisos/listar") return adminNotices();
    if (path === "/api/admin/avisos/enviar" && method === "POST") return adminSendNotice(init);
    if (path === "/api/admin/ia/sugerir-imagem") return unsupported("Sugestao de imagem por IA");
    if (path === "/api/auth/parceiro" || path.startsWith("/api/parceiro")) return unsupported("Portal do parceiro");

    if (path.startsWith("/api/vibeconecta")) return vibeRoute(path, init, params);
    if (path.startsWith("/api/financas")) return financeRoute(path, init);

    if (path === "/api/simular-rancho") return unsupported("Simulador inteligente");
    if (path === "/api/chef-ia") return unsupported("Chef IA");
    if (path === "/api/pesquisa-visual") return unsupported("Pesquisa visual");
    if (path === "/api/analisar-nf" || path === "/api/salvar-lote-nf") return unsupported("OCR de nota fiscal");
    if (path === "/api/geolocalizacao") return unsupported("Geolocalizacao por servidor");

    return response({ success: false, message: `Endpoint nao mapeado no adaptador Supabase: ${path}` }, 404);
  }

  async function vibeRoute(path, init, params) {
    const method = (init.method || "GET").toUpperCase();
    const profile = await currentProfile();

    if (path.match(/^\/api\/vibeconecta\/perfil\/[^/]+$/)) {
      const userId = path.split("/").pop();
      const { data: posts, error } = await client
        .from("vibeconecta_posts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return response({
        success: true,
        perfil: { id: userId, nome: posts && posts[0] ? posts[0].autor_nome : "Usuario" },
        estatisticas: { total_posts: (posts || []).length, total_likes: 0 },
        posts_populares: posts || []
      });
    }

    if (path === "/api/vibeconecta/meus-posts") {
      if (!profile) return response({ success: false }, 401);
      const { data, error } = await client.from("vibeconecta_posts").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
      if (error) throw error;
      return response({ success: true, posts: data || [] });
    }

    if (path === "/api/vibeconecta/posts" && method === "GET") {
      let query = client.from("vibeconecta_posts").select("*, vibeconecta_comentarios(count), vibeconecta_likes(count)").order("created_at", { ascending: false }).limit(60);
      const supermercado = params.get("supermercado");
      if (supermercado) query = query.eq("supermercado", supermercado);
      const { data, error } = await query;
      if (error) throw error;
      return response({ success: true, posts: data || [] });
    }

    if (path === "/api/vibeconecta/posts" && method === "POST") {
      if (!profile) return response({ success: false, message: "Login necessario" }, 401);
      const body = await readJson(init);
      let payload = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
      if (body instanceof FormData) {
        const file = body.get("imagem");
        if (file && file.name) {
          const filePath = `posts/${profile.id}/${Date.now()}-${file.name}`;
          const uploaded = await client.storage.from(bucket).upload(filePath, file, { upsert: true });
          if (!uploaded.error) payload.imagem_url = client.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
        }
      }
      const { error } = await client.from("vibeconecta_posts").insert({
        user_id: profile.id,
        autor_nome: payload.anonimato ? "Anonimo" : profile.nome,
        texto: payload.texto || payload.conteudo,
        supermercado: payload.supermercado,
        imagem_url: payload.imagem_url,
        anonimato: Boolean(payload.anonimato)
      });
      if (error) throw error;
      return response({ success: true, message: "Post criado!" });
    }

    if (path.match(/^\/api\/vibeconecta\/comentarios\/\d+$/)) {
      const postId = Number(path.split("/").pop());
      const { data, error } = await client.from("vibeconecta_comentarios").select("*").eq("post_id", postId).order("created_at");
      if (error) throw error;
      return response({ success: true, comentarios: data || [] });
    }

    if (path === "/api/vibeconecta/comentar" && method === "POST") {
      if (!profile) return response({ success: false }, 401);
      const body = await readJson(init);
      const { error } = await client.from("vibeconecta_comentarios").insert({
        post_id: Number(body.post_id),
        user_id: profile.id,
        autor_nome: profile.nome,
        texto: body.texto || body.comentario
      });
      if (error) throw error;
      return response({ success: true });
    }

    if (path.match(/^\/api\/vibeconecta\/likes\/\d+$/)) {
      if (!profile) return response({ success: false, message: "Usuario nao logado" }, 401);
      const postId = Number(path.split("/").pop());
      if (method === "POST") {
        await client.from("vibeconecta_likes").upsert({ post_id: postId, user_id: profile.id }, { onConflict: "post_id,user_id" });
      }
      if (method === "DELETE") {
        await client.from("vibeconecta_likes").delete().eq("post_id", postId).eq("user_id", profile.id);
      }
      const { count } = await client.from("vibeconecta_likes").select("*", { count: "exact", head: true }).eq("post_id", postId);
      return response({ success: true, liked: method === "POST", total_likes: count || 0 });
    }

    return response({ success: true, tem_novidade: false, posts: [] });
  }

  async function financeRoute(path, init) {
    const method = (init.method || "GET").toUpperCase();
    const profile = await currentProfile();
    if (!profile) return response({ success: false }, 401);

    if (path.match(/^\/api\/financas\/categorias\/[^/]+$/)) {
      const tipo = path.split("/").pop();
      const categorias = tipo === "receita"
        ? ["Salario", "Freelance", "Rendimento", "Outros"]
        : ["Mercado", "Transporte", "Moradia", "Saude", "Lazer", "Outros"];
      return response(categorias);
    }

    if (path === "/api/financas/dados") {
      const { data, error } = await client.from("financas_transacoes").select("*").eq("user_id", profile.id).order("data", { ascending: false });
      if (error) throw error;
      return response({ success: true, transacoes: data || [] });
    }
    if (path === "/api/financas/transacao/salvar" && method === "POST") {
      const body = await readJson(init);
      const { error } = await client.from("financas_transacoes").upsert({ ...body, user_id: profile.id });
      if (error) throw error;
      return response({ success: true });
    }
    if (path.match(/^\/api\/financas\/transacao\/deletar\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const { error } = await client.from("financas_transacoes").delete().eq("id", id).eq("user_id", profile.id);
      if (error) throw error;
      return response({ success: true });
    }
    return response({ success: true, data: [] });
  }

  window.fetch = function patchedFetch(input, init = {}) {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, location.origin);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
    return route(url, init).catch((error) => {
      console.error("Supabase adapter error:", error);
      return response({ success: false, message: error.message || "Erro no adaptador Supabase" }, 500);
    });
  };
})();
