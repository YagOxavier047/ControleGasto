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

async function init() {
  await loadDashboard();
  await loadMovimentacoes();
  await loadQRCode();
  connectWebSocket();
  setupQRReader();
  setupFilters();
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard`);
    const { success, data } = await res.json();

    if (success) {
      document.getElementById('saldo').textContent = formatBRL(data.saldo);
      document.getElementById('gastos-mes').textContent = formatBRL(data.gastosMes);
      document.getElementById('entradas-mes').textContent = formatBRL(data.entradasMes);
      updateSidebarSummary(data);
      renderChart(data.categorias);
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

async function loadMovimentacoes() {
  try {
    const res = await fetch(`${API_URL}/api/movimentacoes`);
    const { success, data } = await res.json();

    if (success) {
      movimentacoesData = data;
      renderMovimentacoes();
      updateSidebarDetails();
    }
  } catch (err) {
    console.error('Erro ao carregar movimentações:', err);
  }
}

function updateSidebarSummary(data) {
  document.getElementById('side-gastos').textContent = formatBRL(data.gastosMes);
  document.getElementById('side-entradas').textContent = formatBRL(data.entradasMes);
}

function updateSidebarDetails() {
  const entradas = movimentacoesData.filter((item) => item.tipo === 'entrada').length;
  const categorias = [...new Set(movimentacoesData.map((item) => item.categoria))].length;
  const ultima = movimentacoesData.length ? formatDate(movimentacoesData[0].data_hora) : '-';

  document.getElementById('detail-receitas').textContent = entradas;
  document.getElementById('detail-categorias').textContent = categorias;
  document.getElementById('detail-ultima').textContent = ultima;
}

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
  const tbody = document.getElementById('tabela-movimentos');
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

function renderChart(categorias) {
  const ctx = document.getElementById('grafico-categorias').getContext('2d');
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

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => console.log('✅ WebSocket conectado');

  ws.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);

    if (type === 'nova_movimentacao') {
      movimentacoesData.unshift(data);
      renderMovimentacoes();
      updateSidebarDetails();
      loadDashboard();
    }
  };

  ws.onclose = () => {
    console.log('🔌 WebSocket desconectado. Reconectando em 3s...');
    setTimeout(connectWebSocket, 3000);
  };
}

async function loadQRCode() {
  try {
    const res = await fetch(`${API_URL}/api/qr-code`);
    const { success, qrCode, botUrl } = await res.json();

    if (success) {
      document.getElementById('qr-img').src = qrCode;
      document.getElementById('qr-link').innerHTML = `Link: <a href="${botUrl}" target="_blank" class="text-brand underline">${botUrl}</a>`;
    }
  } catch (err) {
    console.error('Erro ao carregar QR:', err);
  }
}

function setupQRReader() {
  const html5QrCode = new Html5Qrcode('qr-reader');

  document.getElementById('btn-iniciar-leitor').addEventListener('click', async () => {
    const readerDiv = document.getElementById('qr-reader');
    readerDiv.classList.remove('hidden');

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (decodedText.includes('t.me')) {
            window.open(decodedText, '_blank');
            html5QrCode.stop();
            readerDiv.classList.add('hidden');
          }
        },
        (err) => console.log('Aguardando QR...')
      );
    } catch (err) {
      alert('Erro ao acessar câmera: ' + err);
    }
  });

  document.getElementById('btn-gerar-qr').addEventListener('click', () => {
    document.getElementById('qr-display').classList.remove('hidden');
  });
}

document.addEventListener('DOMContentLoaded', init);

let pizzaChartInstance = null;
let barChartInstance = null;

// Função para renderizar os gráficos
function renderCharts(receitas, despesas) {
    const ctxPizza = document.getElementById('pizzaChart').getContext('2d');
    const ctxBar = document.getElementById('barChart').getContext('2d');

    // Destruir instâncias anteriores se existirem para evitar sobreposição
    if (pizzaChartInstance) pizzaChartInstance.destroy();
    if (barChartInstance) barChartInstance.destroy();

    // Configuração do Gráfico de Pizza
    pizzaChartInstance = new Chart(ctxPizza, {
        type: 'doughnut',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{
                data: [receitas, despesas],
                backgroundColor: ['#22d3ee', '#f97316'], // Cian e Laranja
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#fff' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw;
                            let total = context.dataset.data.reduce((a, b) => a + b, 0);
                            let percentage = ((value / total) * 100).toFixed(1) + '%';
                            return 'R$ ' + value.toFixed(2) + ' (' + percentage + ')';
                        }
                    }
                }
            }
        }
    });

    // Configuração do Gráfico de Barras
    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{
                label: 'Valor (R$)',
                data: [receitas, despesas],
                backgroundColor: ['#22d3ee', '#f97316'],
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#ccc' },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: '#ccc' },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'R$ ' + context.raw.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// Atualize sua função de carregamento do dashboard (ou crie uma nova) para chamar renderCharts
// Exemplo: Dentro da função que busca os dados da API:
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        
        // Supondo que o backend retorne { totalReceitas: X, totalDespesas: Y }
        // Ajuste os nomes das variáveis conforme seu backend real
        const receitas = data.totalReceitas || data.receitas || 0; 
        const despesas = data.totalDespesas || data.despesas || 0;

        renderCharts(receitas, despesas);
        
        // ... resto do seu código de atualização da tabela ...
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// Chame loadDashboardData() quando a página carregar
document.addEventListener('DOMContentLoaded', loadDashboardData);