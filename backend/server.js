const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

// ✅ CRIA O APP AQUI (ANTES DE QUALQUER app.use)
const app = express();

const client = require('prom-client');

// Coletar métricas padrão do Node.js
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

// Criar contador de requisições HTTP
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status_code']
});

// Criar histograma de duração das requisições
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Middleware para coletar métricas de todas as requisições
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status_code: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route: route,
      status_code: res.statusCode
    }, duration);
  });
  
  next();
});

// Middleware para expor métricas do Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    console.error('Erro ao gerar métricas:', err);
    res.status(500).end('Erro ao gerar métricas');
  }
});

// Configuração do Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do PostgreSQL
const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'controle_gastos',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

// Helper para executar queries com log
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executado query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Erro na query', { text, error: err.message });
    throw err;
  }
}

// ===== ROTAS DA API =====

// Dashboard - Dados principais
app.get('/api/dashboard', async (req, res) => {
  try {
    // Saldo total
    const saldoResult = await query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) as saldo
      FROM movimentos
    `);
    
    // Gastos do mês
    const gastosResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
      AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
    
    // Entradas do mês
    const entradasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo = 'entrada'
      AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
    
    // Total de entradas (histórico)
    const totalEntradasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo = 'entrada'
    `);
    
    // Total de gastos (histórico)
    const totalGastosResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
    `);
    
    // Categorias mais gastas
    const categoriasResult = await query(`
      SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
      GROUP BY categoria
      ORDER BY total DESC
      LIMIT 5
    `);
    
    // Últimas movimentações
    const movimentacoesResult = await query(`
      SELECT id, descricao, valor, tipo, categoria, data_hora
      FROM movimentos
      ORDER BY data_hora DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      data: {
        dashboard: {
          saldo: parseFloat(saldoResult.rows[0].saldo),
          gastosMes: parseFloat(gastosResult.rows[0].total),
          entradasMes: parseFloat(entradasResult.rows[0].total),
          totalEntradas: parseFloat(totalEntradasResult.rows[0].total),
          totalGastos: parseFloat(totalGastosResult.rows[0].total),
          categorias: categoriasResult.rows.map(row => ({
            categoria: row.categoria,
            total: parseFloat(row.total),
            qtd: row.qtd
          })),
          movimentacoes: movimentacoesResult.rows.map(row => ({
            id: row.id,
            descricao: row.descricao,
            valor: parseFloat(row.valor),
            tipo: row.tipo,
            categoria: row.categoria,
            data_hora: row.data_hora
          }))
        }
      }
    });
  } catch (err) {
    console.error('Erro ao buscar dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para a Lambda (com opção de buscar do banco real)
app.post('/api/dashboard/atualizar', async (req, res) => {
  try {
    const { atualizar } = req.body;
    
    if (atualizar) {
      // Busca dados reais do banco (mesma lógica do GET /api/dashboard)
      const saldoResult = await query(`
        SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) as saldo
        FROM movimentos
      `);
      
      const gastosResult = await query(`
        SELECT COALESCE(SUM(valor), 0) as total 
        FROM movimentos 
        WHERE tipo IN ('gasto', 'saida')
        AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
      `);
      
      const entradasResult = await query(`
        SELECT COALESCE(SUM(valor), 0) as total 
        FROM movimentos 
        WHERE tipo = 'entrada'
        AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
      `);
      
      const categoriasResult = await query(`
        SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
        FROM movimentos 
        WHERE tipo IN ('gasto', 'saida')
        GROUP BY categoria
        ORDER BY total DESC
        LIMIT 5
      `);
      
      const movimentacoesResult = await query(`
        SELECT id, descricao, valor, tipo, categoria, data_hora
        FROM movimentos
        ORDER BY data_hora DESC
        LIMIT 50
      `);
      
      res.json({
        success: true,
        message: 'Dados atualizados do banco',
        data: {
          dashboard: {
            saldo: parseFloat(saldoResult.rows[0].saldo),
            gastosMes: parseFloat(gastosResult.rows[0].total),
            entradasMes: parseFloat(entradasResult.rows[0].total),
            categorias: categoriasResult.rows.map(row => ({
              categoria: row.categoria,
              total: parseFloat(row.total),
              qtd: row.qtd
            })),
            movimentacoes: movimentacoesResult.rows.map(row => ({
              id: row.id,
              descricao: row.descricao,
              valor: parseFloat(row.valor),
              tipo: row.tipo,
              categoria: row.categoria,
              data_hora: row.data_hora
            }))
          }
        }
      });
    } else {
      // Retorna dados mockados para teste
      res.json({
        success: true,
        data: {
          dashboard: {
            saldo: 15000.50,
            gastosMes: 3250.75,
            entradasMes: 8500.00,
            categorias: [
              { categoria: 'Alimentação', total: 1200.00, qtd: 15 },
              { categoria: 'Transporte', total: 850.50, qtd: 22 },
              { categoria: 'Lazer', total: 650.25, qtd: 8 }
            ],
            movimentacoes: [
              { id: 1, descricao: 'Supermercado', valor: 350.00, tipo: 'gasto', categoria: 'Alimentação', data_hora: new Date().toISOString() },
              { id: 2, descricao: 'Salário', valor: 5000.00, tipo: 'entrada', categoria: 'Renda', data_hora: new Date().toISOString() }
            ]
          }
        }
      });
    }
  } catch (err) {
    console.error('Erro ao atualizar dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// QR Code do Bot
app.get('/api/qr-code', async (req, res) => {
  try {
    const botUrl = process.env.BOT_URL || 'https://t.me/seu_bot';
    
    // Gera URL do QR Code (usando API pública)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(botUrl)}`;
    
    res.json({
      success: true,
      qrCode: qrCodeUrl,
      botUrl: botUrl
    });
  } catch (err) {
    console.error('Erro ao gerar QR Code:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Servir frontend em produção
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== WEBSOCKET =====
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('🔌 Cliente WebSocket conectado');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Exemplo: receber nova movimentação via WebSocket
      if (data.type === 'nova_movimentacao') {
        // Broadcast para todos os clientes conectados
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'nova_movimentacao',
              data: data.payload
            }));
          }
        });
      }
    } catch (err) {
      console.error('Erro ao processar mensagem WebSocket:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Cliente WebSocket desconectado');
  });
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor HTTP rodando em http://0.0.0.0:${PORT}`);
  console.log(`🚀 WebSocket rodando em ws://localhost:${WS_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Recebido SIGTERM, fechando conexões...');
  await pool.end();
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 Recebido SIGINT, fechando conexões...');
  await pool.end();
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});