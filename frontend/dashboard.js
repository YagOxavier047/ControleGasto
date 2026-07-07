// ===== CONFIGURAÇÃO DA API =====
const API_URL = 'http://3.91.92.106:3001';
const WS_URL = 'ws://3.91.92.106:8080';

// ===== UTILITÁRIOS =====
const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (isoString) =>
  new Date(isoString).toLocaleString('pt-BR');

let chartInstance = null;
let ws = null;
let movimentacoesData = [];
let currentFilter = 'all';

function safeGetElement(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`⚠️ Elemento #${id} não encontrado`);
  return el;
}

// ===== INICIALIZAÇÃO =====
async function init() {
  try {
    await loadDashboard();
    await loadMovimentacoes();
    await loadQRCode();
    connectWebSocket();
    setupQRReader();
    setupFilters();
  } catch (err) {
    console.error('Erro na inicialização:', err);
  }
}

// ===== ATUALIZAR DADOS DO BANCO =====
async function atualizarDadosDoBanco() {
    const btn = safeGetElement('btn-atualizar');
    if (!btn) { console.error('Botão não encontrado'); return; }
    
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span>Atualizando...</span>';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/api/dashboard/atualizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ atualizar: true })
        });
        const result = await response.json();
        
        if (result.success && result.data?.dashboard) {
            await atualizarInterface(result.data.dashboard);
            mostrarNotificacao('✅ Dados atualizados!', 'success');
        } else {
            throw new Error('Falha ao atualizar');
        }
    } catch (err) {
        console.error('Erro:', err);
        mostrarNotificacao('❌ Erro ao atualizar', 'error');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function atualizarInterface(dashboard) {
    const saldoEl = safeGetElement('saldo');
    const gastosEl = safeGetElement('gastos-mes');
    const entradasEl = safeGetElement('entradas-mes');
    
    if (saldoEl) saldoEl.textContent = formatBRL(dashboard.saldo);
    if (gastosEl) gastosEl.textContent = formatBRL(dashboard.gastosMes);
    if (entradasEl) entradasEl.textContent = formatBRL(dashboard.entradasMes || 0);
    
    if (dashboard.movimentacoes) {
        movimentacoesData = dashboard.movimentacoes;
        renderMovimentacoes();
        updateSidebarDetails();
    }
    if (dashboard.categorias && safeGetElement('grafico-categorias')) {
        renderChart(dashboard.categorias);
    }
    updateSidebarSummary(dashboard);
}

function mostrarNotificacao(mensagem, tipo = 'success') {
    const div = document.createElement('div');
    div.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 ${tipo === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`;
    div.textContent = mensagem;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const response = await fetch(`${API_URL}/api/dashboard`);
    const result = await response.json();
    if (result.success && result.data?.dashboard) {
      const d = result.data.dashboard;
      const el = safeGetElement('saldo');
      if (el) el.textContent = formatBRL(d.saldo);
      const el2 = safeGetElement('gastos-mes');
      if (el2) el2.textContent = formatBRL(d.gastosMes);
      updateSidebarSummary(d);
      if (safeGetElement('grafico-categorias') && d.categorias) {
        renderChart(d.categorias);
      }
    }
  } catch (err) { console.error('Erro dashboard:', err); }
}

// ===== MOVIMENTAÇÕES =====
async function loadMovimentacoes() {
  try {
    const response = await fetch(`${API_URL}/api/dashboard`);
    const result = await response.json();
    if (result.success && result.data?.dashboard?.movimentacoes) {
      movimentacoesData = result.data.dashboard.movimentacoes;
      renderMovimentacoes();
      updateSidebarDetails();
    }
  } catch (err) { console.error('Erro movimentacoes:', err); }
}

function updateSidebarSummary(data) {
  const el = safeGetElement('side-gastos');
  if (el) el.textContent = formatBRL(data.gastosMes);
  const el2 = safeGetElement('side-entradas');
  if (el2) el2.textContent = formatBRL(data.entradasMes || 0);
}

function updateSidebarDetails() {
  const entradas = movimentacoesData.filter(i => i.tipo === 'entrada').length;
  const cats = [...new Set(movimentacoesData.map(i => i.categoria))].length;
  const ultima = movimentacoesData.length ? formatDate(movimentacoesData[0].data_hora) : '-';
  const el = safeGetElement('detail-receitas');
  if (el) el.textContent = entradas;
  const el2 = safeGetElement('detail-categorias');
  if (el2) el2.textContent = cats;
  const el3 = safeGetElement('detail-ultima');
  if (el3) el3.textContent = ultima;
}

function setupFilters() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
  setFilter('all');
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.classList.toggle('bg-brand', btn.dataset.filter === filter);
    btn.classList.toggle('text-white', btn.dataset.filter === filter);
  });
  renderMovimentacoes();
}

function renderMovimentacoes() {
  const tbody = safeGetElement('tabela-movimentos');
  if (!tbody) return;
  const rows = movimentacoesData
    .filter(i => currentFilter === 'all' || i.tipo === currentFilter)
    .map(m => {
      const label = m.tipo === 'gasto' ? 'Saída' : 'Entrada';
      const color = m.tipo === 'gasto' ? 'text-orange-400' : 'text-cyan-400';
      return `<tr class="border-b border-slate-800"><td class="py-2 px-2">${formatDate(m.data_hora)}</td><td class="py-2 px-2 ${color}">${label}</td><td class="py-2 px-2">${m.categoria}</td><td class="py-2 px-2">${m.descricao}</td><td class="py-2 px-2 font-semibold ${color}">${formatBRL(m.valor)}</td></tr>`;
    });
  tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="py-4 text-center">Nenhuma movimentação</td></tr>';
}

function renderChart(categorias) {
  const canvas = safeGetElement('grafico-categorias');
  if (!canvas || !categorias?.length) return;
  const ctx = canvas.getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categorias.map(c => c.categoria),
      datasets: [{ data: categorias.map(c => c.total), backgroundColor: ['#38bdf8','#fb923c','#a78bfa','#34d399','#f472b6'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
  });
}

function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        if (type === 'nova_movimentacao') {
          movimentacoesData.unshift(data);
          renderMovimentacoes();
          loadDashboard();
        }
      } catch(err) { console.error('WS error:', err); }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  } catch(err) { console.error('WS connect error:', err); }
}

async function loadQRCode() {
  try {
    const res = await fetch(`${API_URL}/api/qr-code`);
    const { success, qrCode, botUrl } = await res.json();
    if (success) {
      const img = safeGetElement('qr-img');
      if (img) img.src = qrCode;
      const link = safeGetElement('qr-link');
      if (link) link.textContent = botUrl;
    }
  } catch(err) { console.error('QR error:', err); }
}

function setupQRReader() {
  const btn = safeGetElement('btn-iniciar-leitor');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const div = safeGetElement('qr-reader');
    if (!div || typeof Html5Qrcode === 'undefined') return;
    div.classList.remove('hidden');
    const qr = new Html5Qrcode('qr-reader');
    await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => {
      if (text.includes('t.me')) { window.open(text, '_blank'); qr.stop(); div.classList.add('hidden'); }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);