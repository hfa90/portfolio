const SnapCommissions = (() => {

  let _sb = null;
  let _cfg = { taxaServicoEnabled: false, motoFeePct: 100 };

  /* ── init ─────────────────────────────────────────── */
  function init(supabaseClient, config = {}) {
    _sb = supabaseClient;
    _cfg = { ..._cfg, ...config };
  }

  function updateConfig(config = {}) {
    _cfg = { ..._cfg, ...config };
  }

  /* ── creditOrder ──────────────────────────────────────
   * Grava comissões no banco ao finalizar (entregar) pedido.
   * Chame no snap-admin.html dentro de confirmDelivery().
   */
  async function creditOrder(order) {
    if (!_sb) return { serviceFeeAmount: 0, deliveryFeeAmount: 0, errors: ['Supabase não inicializado'] };

    const errors = [];
    const isDelivery = order.order_type === 'delivery';
    const subtotal = Number(order.subtotal || order.total || 0);
    const delivFee = Number(order.delivery_fee || 0);
    const now = new Date().toISOString();
    let serviceFeeAmount = 0, deliveryFeeAmount = 0;
    const orderPatch = { updated_at: now };

    /* Taxa de serviço — presencial + habilitada + tem atendente */
    if (!isDelivery && _cfg.taxaServicoEnabled && order.attendant_id) {
      serviceFeeAmount = r2(subtotal * 0.10);
      orderPatch.service_fee_paid = true;
      try {
        const { error } = await _sb.from('staff_commissions').insert({
          staff_id: order.attendant_id, order_id: order.id,
          type: 'taxa_servico', amount: serviceFeeAmount,
          order_type: order.order_type, paid: true, created_at: now,
        });
        if (error) throw error;
      } catch (e) { errors.push('taxa_servico: ' + msg(e)); }
    }

    /* Taxa de entrega — delivery + tem entregador + taxa > 0 */
    if (isDelivery && order.deliverer_id && delivFee > 0) {
      deliveryFeeAmount = r2(delivFee * _cfg.motoFeePct / 100);
      orderPatch.delivery_fee_paid = true;
      try {
        const { error } = await _sb.from('staff_commissions').insert({
          staff_id: order.deliverer_id, order_id: order.id,
          type: 'taxa_entrega', amount: deliveryFeeAmount,
          order_type: order.order_type, paid: true, created_at: now,
        });
        if (error) throw error;
      } catch (e) { errors.push('taxa_entrega: ' + msg(e)); }
    }

    /* Atualizar flags no pedido */
    if (Object.keys(orderPatch).length > 1) {
      try {
        const { error } = await _sb.from('orders').update(orderPatch).eq('id', order.id);
        if (error) throw error;
      } catch (e) { errors.push('patch order: ' + msg(e)); }
    }

    return { serviceFeeAmount, deliveryFeeAmount, errors };
  }

  /* ── getStaffCommissions ──────────────────────────────
   * Comissões de um funcionário por período.
   * Usado em snap-atendente.html (painel Minhas Comissões).
   */
  async function getStaffCommissions(staffId, period = 'today', type = null) {
    if (!_sb) return { total: 0, paid: 0, pending: 0, rows: [] };

    let q = _sb
      .from('staff_commissions')
      .select('*, orders(order_number, customer_name)')
      .eq('staff_id', staffId)
      .gte('created_at', periodStart(period).toISOString())
      .order('created_at', { ascending: false });

    if (type) q = q.eq('type', type);

    try {
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const paid = rows.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0);
      const pending = rows.filter(r => !r.paid).reduce((s, r) => s + Number(r.amount), 0);
      return { total: paid + pending, paid, pending, rows };
    } catch (e) {
      console.error('[SnapCommissions]', msg(e));
      return { total: 0, paid: 0, pending: 0, rows: [], error: msg(e) };
    }
  }

  /* ── getAllStaffSummary ────────────────────────────────
   * Resumo agregado por funcionário — usado no snap-admin.html.
   */
  async function getAllStaffSummary(period = 'today') {
    if (!_sb) return [];
    try {
      const { data, error } = await _sb
        .from('staff_commissions')
        .select('staff_id, type, amount, paid')
        .gte('created_at', periodStart(period).toISOString());
      if (error) throw error;

      const map = {};
      (data || []).forEach(r => {
        const k = r.staff_id + '_' + r.type;
        if (!map[k]) map[k] = { staffId: r.staff_id, type: r.type, total: 0, paid: 0, pending: 0 };
        const a = Number(r.amount);
        map[k].total += a;
        r.paid ? (map[k].paid += a) : (map[k].pending += a);
      });
      return Object.values(map);
    } catch (e) {
      console.error('[SnapCommissions]', msg(e));
      return [];
    }
  }

  /* ── getAdminTotals ───────────────────────────────────
   * Totais globais para KPIs do painel admin.
   */
  async function getAdminTotals(period = 'today') {
    const t = { totalPaid: 0, totalPending: 0, taxaServico: 0, taxaEntrega: 0 };
    if (!_sb) return t;
    try {
      const { data } = await _sb
        .from('staff_commissions')
        .select('type, amount, paid')
        .gte('created_at', periodStart(period).toISOString());
      (data || []).forEach(r => {
        const a = Number(r.amount);
        r.paid ? (t.totalPaid += a) : (t.totalPending += a);
        if (r.type === 'taxa_servico') t.taxaServico += a;
        if (r.type === 'taxa_entrega') t.taxaEntrega += a;
      });
    } catch (e) { console.error('[SnapCommissions]', msg(e)); }
    return t;
  }

  /* ── helpers privados ── */
  function periodStart(p) {
    const now = new Date();
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    if (p === 'today') return d;
    if (p === 'week') { d.setDate(d.getDate() - d.getDay()); return d; }
    if (p === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    return new Date(0);
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function msg(e) { return e && e.message ? e.message : String(e); }
  function fmt(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }

  return { init, updateConfig, creditOrder, getStaffCommissions, getAllStaffSummary, getAdminTotals, fmt };
})();

if (typeof window !== 'undefined') window.SnapCommissions = SnapCommissions;
if (typeof module !== 'undefined') module.exports = SnapCommissions;
