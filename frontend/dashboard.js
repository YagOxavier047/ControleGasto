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
const response = await fetch(`${API_URL}/api/dashboard/atualizar`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        atualizar: true
    })
 });
    // Animação de loading
    const originalContent = btn.innerHTML;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        <span>Atualizando...</span>
    `;
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    
    try {
        // Chama a Lambda com parâmetro para buscar do banco
        const response = await fetch(`${API_URL}/controle-gastos-powerbi`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                atualizar: true
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.data && result.data.dashboard) {
            const dashboard = result.data.dashboard;
            
            // Atualiza dashboard
            await atualizarInterface(dashboard);
            
            // Mostra mensagem de sucesso
            mostrarNotificacao('✅ Dados atualizados com sucesso!', 'success');
        } else {
            throw new Error('Falha ao atualizar dados');
        }
        
    } catch (err) {
        console.error('Erro ao atualizar dados:', err);
        mostrarNotificacao('❌ Erro ao atualizar dados. Tente novamente.', 'error');
    } finally {
        // Restaura botão
        btn.innerHTML = originalContent;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

async function atualizarInterface(dashboard) {
    // Atualiza cards
    const saldoEl = safeGetElement('saldo');
    const gastosEl = safeGetElement('gastos-mes');
    const entradasEl = safeGetElement('entradas-mes');
    
    if (saldoEl) saldoEl.textContent = formatBRL(dashboard.saldo);
    if (gastosEl) gastosEl.textContent = formatBRL(dashboard.gastosMes);
    if (entradasEl) entradasEl.textContent = formatBRL(dashboard.entradasMes || 0);
    
    // Atualiza movimentações
    if (dashboard.movimentacoes) {
        movimentacoesData = dashboard.movimentacoes;
        renderMovimentacoes();
        updateSidebarDetails();
    }
    
    // Atualiza gráfico
    if (dashboard.categorias && safeGetElement('grafico-categorias')) {
        renderChart(dashboard.categorias);
    }
    
    // Atualiza resumo lateral
    updateSidebarSummary(dashboard);
}

function mostrarNotificacao(mensagem, tipo = 'success') {
    // Cria elemento de notificação
    const notificacao = document.createElement('div');
    notificacao.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-2xl z-50 transform transition-all duration-300 translate-x-full ${
        tipo === 'success' ? 'bg-green-500' : 'bg-red-500'
    } text-white`;
    notificacao.innerHTML = `
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${tipo === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}" />
            </svg>
            <span class="font-semibold">${mensagem}</span>
        </div>
    `;
    
    document.body.appendChild(notificacao);
    
    // Anima entrada
    setTimeout(() => {
        notificacao.classList.remove('translate-x-full');
    }, 100);
    
    // Remove após 3 segundos
    setTimeout(() => {
        notificacao.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => notificacao.remove(), 300);
    }, 3000);
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const response = await fetch(`${API_URL}/controle-gastos-powerbi`);
    const result = await response.json();
    
    if (result.success && result.data && result.data.dashboard) {
      const dashboard = result.data.dashboard;
      
      const saldoEl = safeGetElement('saldo');
      const gastosEl = safeGetElement('gastos-mes');
      const entradasEl = safeGetElement('entradas-mes');

      if (saldoEl) saldoEl.textContent = formatBRL(dashboard.saldo);
      if (gastosEl) gastosEl.textContent = formatBRL(dashboard.gastosMes);
      if (entradasEl) entradasEl.textContent = formatBRL(dashboard.entradasMes || 0);

      updateSidebarSummary(dashboard);

      if (safeGetElement('grafico-categorias') && dashboard.categorias) {
        renderChart(dashboard.categorias);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

// ===== MOVIMENTAÇÕES =====
async function loadMovimentacoes() {
  try {
    const response = await fetch(`${API_URL}/controle-gastos-powerbi`);
    const result = await response.json();
    
    if (result.success && result.data && result.data.dashboard && result.data.dashboard.movimentacoes) {
      movimentacoesData = result.data.dashboard.movimentacoes;
      renderMovimentacoes();
      updateSidebarDetails();
    }
  } catch (err) {
    console.error('Erro ao carregar movimentações:', err);
  }
}

// ===== RESUMO LATERAL =====
function updateSidebarSummary(data) {
  const sideGastos = safeGetElement('side-gastos');
  const sideEntradas = safeGetElement('side-entradas');

  if (sideGastos) sideGastos.textContent = formatBRL(data.gastosMes);
  if (sideEntradas) sideEntradas.textContent = formatBRL(data.entradasMes || 0);
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
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
          <td class="py-4 px-2">${formatDate(m.data_hora)}</td>
          <td class="py-4 px-2 ${typeColor} font-medium">${typeLabel}</td>
          <td class="py-4 px-2">${m.categoria}</td>
          <td class="py-4 px-2 text-slate-300">${m.descricao}</td>
          <td class="py-4 px-2 font-semibold ${typeColor}">${formatBRL(m.valor)}</td>
        </tr>
      `;
    });

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-500">
          Nenhuma movimentação encontrada para este filtro.
        </td>
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

  const chartColors = [
    '#38bdf8', // Azul claro
    '#fb923c', // Laranja
    '#a78bfa', // Roxo
    '#34d399', // Verde
    '#f472b6', // Rosa
    '#60a5fa', // Azul médio
    '#fbbf24', // Âmbar
  ];

  const totalValue = categorias.reduce((sum, item) => sum + item.total, 0);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categorias.map((c) => c.categoria),
      datasets: [{
        data: categorias.map((c) => c.total),
        backgroundColor: chartColors,
        borderColor: '#1e293b',
        borderWidth: 4,
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 3,
        spacing: 3,
        offset: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      layout: {
        padding: { top: 20, bottom: 20, left: 10, right: 10 }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Inter',
              size: 12,
              weight: '500'
            },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 10,
            boxHeight: 10,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 14,
          titleFont: {
            family: 'Inter',
            size: 13,
            weight: '600'
          },
          bodyFont: {
            family: 'Inter',
            size: 12
          },
          cornerRadius: 8,
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          callbacks: {
            label: (context) => {
              const amount = formatBRL(context.parsed);
              const percentage = ((context.parsed / totalValue) * 100).toFixed(1);
              return ` ${context.label}: ${amount} (${percentage}%)`;
            },
          },
        },
        animation: {
          animateScale: true,
          animateRotate: true,
          duration: 1200,
          easing: 'easeOutQuart',
        },
        hover: {
          mode: 'nearest',
          intersect: false,
          animationDuration: 300,
        },
      },
      plugins: [{
        id: 'centerText',
        beforeDraw: (chart) => {
          const { width, height, ctx } = chart;
          ctx.save();

          const fontSize = (height / 16).toFixed(2);
          ctx.font = `700 ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = '#f1f5f9';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(formatBRL(totalValue), width / 2, height / 2 - 12);

          ctx.font = `400 ${Math.max(fontSize * 0.65, 11)}px Inter, sans-serif`;
          ctx.fillStyle = '#64748b';
          ctx.fillText('Total', width / 2, height / 2 + 16);

          ctx.restore();
        },
      }],
    },
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
    const response = await fetch(`${API_URL}/api/qr-code`);
    const { success, qrCode, botUrl } = await response.json();

    if (success) {
      const qrImg = safeGetElement('qr-img');
      const qrLink = safeGetElement('qr-link');

      if (qrImg) qrImg.src = qrCode;
      if (qrLink) qrLink.innerHTML = `Link: ${botUrl} 🔗`;
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