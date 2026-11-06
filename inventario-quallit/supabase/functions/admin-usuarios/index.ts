// =====================================================================
//  INVENTÁRIO QUALLIT — Edge Function "admin-usuarios"
//  Gestão de logins (criar, editar, trocar senha, ativar/desativar, excluir).
//  Só administradores ativos podem chamar. A chave service_role fica só aqui no servidor.
//
//  Publicar (sem instalar nada): Supabase > Edge Functions > Deploy a new function > Via Editor,
//  nome "admin-usuarios", cole este arquivo e clique em Deploy.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_PERMANENTE = '876000h'; // ~100 anos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // quem está chamando?
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: quem, error: eu } = await admin.auth.getUser(jwt);
    if (eu || !quem?.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);
    const eu_id = quem.user.id;
    const { data: meu } = await admin.from('perfis').select('papel, ativo').eq('user_id', eu_id).maybeSingle();
    if (!meu || meu.papel !== 'admin' || !meu.ativo) return json({ error: 'Apenas administradores.' }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || '');

    const contarAdmins = async (excluir?: string) => {
      let q = admin.from('perfis').select('user_id', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true);
      if (excluir) q = q.neq('user_id', excluir);
      const { count } = await q;
      return count ?? 0;
    };
    const validarCd = async (papel: string, cd_id: string | null) => {
      if (papel === 'field' && !cd_id) throw new Error('Usuário Field precisa de um CD.');
      if (cd_id) {
        const { data } = await admin.from('cds').select('id').eq('id', cd_id).maybeSingle();
        if (!data) throw new Error('CD não encontrado.');
      }
    };

    // ------------------------------------------------------------ listar
    if (acao === 'listar') {
      const usuarios: Record<string, unknown>[] = [];
      for (let page = 1; page < 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        usuarios.push(...data.users.map((u) => ({
          id: u.id, email: u.email, ultimo_acesso: u.last_sign_in_at, criado_em: u.created_at,
          bloqueado: (() => { const b = (u as { banned_until?: string | null }).banned_until; return !!b && new Date(b) > new Date(); })(),
        })));
        if (data.users.length < 1000) break;
      }
      const { data: perfis, error } = await admin.from('perfis').select('*');
      if (error) throw error;
      const porId = new Map(perfis.map((p) => [p.user_id, p]));
      return json({
        usuarios: usuarios.map((u) => {
          const p = porId.get(u.id as string);
          return { ...u, nome: p?.nome ?? null, papel: p?.papel ?? null, cd_id: p?.cd_id ?? null, ativo: p ? p.ativo && !u.bloqueado : false, sem_perfil: !p };
        }),
      });
    }

    // ------------------------------------------------------------ criar
    if (acao === 'criar') {
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '');
      const nome = String(body.nome || '').trim();
      const papel = body.papel === 'admin' ? 'admin' : 'field';
      const cd_id = papel === 'field' ? (body.cd_id || null) : (body.cd_id || null);
      if (!EMAIL.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      if (senha.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
      if (!nome) return json({ error: 'Informe o nome.' }, 400);
      await validarCd(papel, cd_id);

      const { data: criado, error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? 'Já existe um login com este e-mail.' : error.message;
        return json({ error: msg }, 400);
      }
      const { error: ep } = await admin.from('perfis').insert({ user_id: criado.user.id, nome, email, papel, cd_id });
      if (ep) { await admin.auth.admin.deleteUser(criado.user.id); throw ep; }
      return json({ ok: true, id: criado.user.id });
    }

    const id = String(body.id || '');
    if (!id) return json({ error: 'Usuário não informado.' }, 400);

    // ------------------------------------------------------------ atualizar
    if (acao === 'atualizar') {
      const { data: atual } = await admin.from('perfis').select('*').eq('user_id', id).maybeSingle();
      const nome = body.nome !== undefined ? String(body.nome).trim() : atual?.nome;
      const papel = body.papel !== undefined ? (body.papel === 'admin' ? 'admin' : 'field') : (atual?.papel ?? 'field');
      const cd_id = body.cd_id !== undefined ? (body.cd_id || null) : (atual?.cd_id ?? null);
      const ativo = body.ativo !== undefined ? !!body.ativo : (atual?.ativo ?? true);
      if (!nome) return json({ error: 'Informe o nome.' }, 400);
      await validarCd(papel, cd_id);
      if (id === eu_id && (papel !== 'admin' || !ativo)) return json({ error: 'Você não pode remover o seu próprio acesso de administrador.' }, 400);
      if (atual?.papel === 'admin' && (papel !== 'admin' || !ativo) && (await contarAdmins(id)) === 0)
        return json({ error: 'É preciso manter pelo menos um administrador ativo.' }, 400);

      const mudancasAuth: Record<string, unknown> = { ban_duration: ativo ? 'none' : BAN_PERMANENTE, user_metadata: { nome } };
      let email = atual?.email;
      if (body.email !== undefined) {
        email = String(body.email).trim().toLowerCase();
        if (!EMAIL.test(email!)) return json({ error: 'E-mail inválido.' }, 400);
        mudancasAuth.email = email;
        mudancasAuth.email_confirm = true;
      }
      const { error: ea } = await admin.auth.admin.updateUserById(id, mudancasAuth);
      if (ea) return json({ error: /already|registered|exists/i.test(ea.message) ? 'Já existe um login com este e-mail.' : ea.message }, 400);
      const { error: ep } = await admin.from('perfis').upsert({ user_id: id, nome, email, papel, cd_id, ativo });
      if (ep) throw ep;
      return json({ ok: true });
    }

    // ------------------------------------------------------------ senha
    if (acao === 'senha') {
      const senha = String(body.senha || '');
      if (senha.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ------------------------------------------------------------ excluir
    if (acao === 'excluir') {
      if (id === eu_id) return json({ error: 'Você não pode excluir o seu próprio usuário.' }, 400);
      const { data: alvo } = await admin.from('perfis').select('papel, ativo').eq('user_id', id).maybeSingle();
      if (alvo?.papel === 'admin' && alvo.ativo && (await contarAdmins(id)) === 0)
        return json({ error: 'É preciso manter pelo menos um administrador ativo.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
