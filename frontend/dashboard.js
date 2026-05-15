const API_URL = 'http://54.196.11.194:3001';
const WS_URL = 'ws://54.196.11.194:8080';

const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (isoString) =>
  new Date(isoString).toLocaleString('pt-BR');

let chartInstance = null;
let ws = null;
let movimentacoesData = [];
let currentFilter = 'all';

// ===== UTILITÁRIOS =====
function safeGetElement(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`⚠️ Elemento #${id} não encontrado`);
  return el;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type');
  
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    console.error(`❌ Esperado JSON, recebido: ${contentType}`);
    console.error('Resposta:', text.substring(0, 200));
    throw new Error('API retornou HTML ou formato inválido');
  }
  
  return res.json();
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

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const { success, data } = await fetchJSON(`${API_URL}/api/dashboard`);

    if (success && data) {
      const saldoEl = safeGetElement('saldo');
      const gastosEl = safeGetElement('gastos-mes');
      const entradasEl = safeGetElement('entradas-mes');
      
      if (saldoEl) saldoEl.textContent = formatBRL(data.saldo);
      if (gastosEl) gastosEl.textContent = formatBRL(data.gastosMes);
      if (entradasEl) entradasEl.textContent = formatBRL(data.entradasMes);
      
      updateSidebarSummary(data);
      
      // Só renderiza gráfico se o canvas existir
      if (safeGetElement('grafico-categorias')) {
        renderChart(data.categorias);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

// ===== MOVIMENTAÇÕES =====
async function loadMovimentacoes() {
  try {
    const { success, data } = await fetchJSON(`${API_URL}/api/movimentacoes`);

    if (success && Array.isArray(data)) {
      movimentacoesData = data;
      renderMovimentacoes();
      updateSidebarDetails();
    }
  } catch (err) {
    console.error('Erro ao carregar movimentações:', err);
  }
}

function updateSidebarSummary(data) {
  const sideGastos = safeGetElement('side-gastos');
  const sideEntradas = safeGetElement('side-entradas');
  
  if (sideGastos) sideGastos.textContent = formatBRL(data.gastosMes);
  if (sideEntradas) sideEntradas.textContent = formatBRL(data.entradasMes);
}

function updateSidebarDetails() {
  const entradas = movimentacoesData.filter((item) => item.tipo === 'entrada').length;
  const categorias = [...new Set(movimentacoesData.map((item) => item.categoria))].length;
  const ultima = movimentacoesData.length ? formatDate(movimentacoesData[0].data_hora) : '-';

  const detailReceitas = safeGetElement('detail-receitas');
  const detailCategorias = safeGetElement('detail-categorias');
  const detailUltima = safeGetElement('detail-ultima');
  
  if (detailReceitas) detailReceitas.textContent = entradas;
  if (detailCategorias) detailCategorias.textContent = categorias;
  if (detailUltima) detailUltima.textContent = ultima;
}

// ===== FILTROS =====
function setupFilters() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });
  setFilter('all');
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle('bg-brand', isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle('bg-slate-800', !isActive);
    button.classList.toggle('text-slate-200', !isActive);
  });
  renderMovimentacoes();
}

function renderMovimentacoes() {
  const tbody = safeGetElement('tabela-movimentos');
  if (!tbody) return;
  
  const rows = movimentacoesData
    .filter((item) => currentFilter === 'all' || item.tipo === currentFilter)
    .map((m) => {
      const typeLabel = m.tipo === 'gasto' ? 'Saída' : 'Entrada';
      const typeColor = m.tipo === 'gasto' ? 'text-orange-400' : 'text-cyan-400';

      return `
        <tr class="transition hover:bg-slate-800/80">
          <td class="px-5 py-4 text-sm text-slate-300">${formatDate(m.data_hora)}</td>
          <td class="px-5 py-4 text-sm"><span class="${typeColor} font-semibold">${typeLabel}</span></td>
          <td class="px-5 py-4 text-sm text-slate-300">${m.categoria}</td>
          <td class="px-5 py-4 text-sm text-slate-300">${m.descricao}</td>
          <td class="px-5 py-4 text-sm font-semibold ${m.tipo === 'gasto' ? 'text-orange-400' : 'text-cyan-400'}">${formatBRL(m.valor)}</td>
        </tr>
      `;
    });

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">Nenhuma movimentação encontrada para este filtro.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.join('');
}

// ===== GRÁFICO =====
function renderChart(categorias) {
  const canvas = safeGetElement('grafico-categorias');
  if (!canvas || !Array.isArray(categorias) || categorias.length === 0) {
    console.log('📊 Gráfico: elementos ausentes ou sem dados');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const textColor = '#e2e8f0';
  const borderColor = '#334155';
  const surfaceColor = '#0f172a';
  const panelColor = '#111827';
  const chartColors = ['#38bdf8', '#fb923c', '#60a5fa', '#38bdf8', '#f97316', '#93c5fd'];
  const totalValue = categorias.reduce((sum, item) => sum + item.total, 0);
  const title = `Total: ${formatBRL(totalValue)}`;

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categorias.map((c) => c.categoria),
      datasets: [{
        data: categorias.map((c) => c.total),
        backgroundColor: chartColors,
        borderColor: panelColor,
        borderWidth: 3,
        hoverOffset: 18,
        spacing: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      layout: { padding: 20 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            boxWidth: 14,
            boxHeight: 14,
            padding: 16,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: surfaceColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: borderColor,
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context) => {
              const amount = formatBRL(context.parsed);
              const percentage = ((context.parsed / totalValue) * 100).toFixed(1);
              return `${context.label}: ${amount} (${percentage}%)`;
            },
          },
        },
      },
      animation: {
        animateScale: true,
        animateRotate: true,
      },
    },
    plugins: [{
      id: 'centerText',
      beforeDraw: (chart) => {
        const { width, height, ctx } = chart;
        ctx.save();
        const fontSize = (height / 12).toFixed(2);
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, width / 2, height / 2 - 10);
        ctx.font = `400 ${Math.max(fontSize * 0.75, 14)}px Inter, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Gastos por categoria', width / 2, height / 2 + 18);
        ctx.restore();
      },
    }],
  });
}

// ===== WEBSOCKET =====
function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => console.log('✅ WebSocket conectado');

    ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        if (type === 'nova_movimentacao') {
          movimentacoesData.unshift(data);
          renderMovimentacoes();
          updateSidebarDetails();
          loadDashboard();
        }
      } catch (err) {
        console.error('Erro ao processar mensagem WebSocket:', err);
      }
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket desconectado. Reconectando em 3s...');
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (err) => {
      console.error('❌ Erro no WebSocket:', err);
    };
  } catch (err) {
    console.error('Erro ao conectar WebSocket:', err);
  }
}

// ===== QR CODE =====
async function loadQRCode() {
  try {
    const { success, qrCode, botUrl } = await fetchJSON(`${API_URL}/api/qr-code`);

    if (success) {
      const qrImg = safeGetElement('qr-img');
      const qrLink = safeGetElement('qr-link');
      
      if (qrImg) qrImg.src = qrCode;
      if (qrLink) qrLink.innerHTML = `Link: <a href="${botUrl}" target="_blank" class="text-brand underline">${botUrl}</a>`;
    }
  } catch (err) {
    console.error('Erro ao carregar QR:', err);
  }
}

function setupQRReader() {
  const btnIniciar = safeGetElement('btn-iniciar-leitor');
  const btnGerar = safeGetElement('btn-gerar-qr');
  
  if (!btnIniciar || !btnGerar) {
    console.log('📷 Elementos do QR Reader não encontrados');
    return;
  }
  
  let html5QrCode = null;
  
  btnIniciar.addEventListener('click', async () => {
    const readerDiv = safeGetElement('qr-reader');
    if (!readerDiv) return;
    
    readerDiv.classList.remove('hidden');

    try {
      if (typeof Html5Qrcode !== 'undefined') {
        html5QrCode = new Html5Qrcode('qr-reader');
        
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (decodedText.includes('t.me')) {
              window.open(decodedText, '_blank');
              html5QrCode?.stop();
              readerDiv.classList.add('hidden');
            }
          },
          (err) => console.log('Aguardando QR...')
        );
      }
    } catch (err) {
      alert('Erro ao acessar câmera: ' + err);
    }
  });

  btnGerar.addEventListener('click', () => {
    const qrDisplay = safeGetElement('qr-display');
    if (qrDisplay) qrDisplay.classList.remove('hidden');
  });
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', init);