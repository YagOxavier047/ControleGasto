// backend/server.js
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const QRCode = require('qrcode');
require('dotenv').config();

const { query } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

app.use(cors());
app.use(express.json());

// Store para clientes WebSocket
const clients = new Set();

// 🔹 ENDPOINTS DA API

// 1. Buscar todas as movimentações
app.get('/api/movimentacoes', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, tipo, categoria, valor, descricao, data_hora 
      FROM movimentos 
      ORDER BY data_hora DESC 
      LIMIT 50
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar movimentações:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Dashboard - Resumo financeiro
app.get('/api/dashboard', async (req, res) => {
  try {
    // Saldo total
    const saldoResult = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) as saldo
      FROM movimentos
    `);
    
    // Gastos do mês atual
    const gastosResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo = 'gasto' 
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
    
    // Top categorias de gastos
    const categoriasResult = await query(`
      SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
      FROM movimentos 
      WHERE tipo = 'gasto'
      GROUP BY categoria
      ORDER BY total DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: {
        saldo: parseFloat(saldoResult.rows[0].saldo),
        gastosMes: parseFloat(gastosResult.rows[0].total),
        entradasMes: parseFloat(entradasResult.rows[0].total),
        categorias: categoriasResult.rows
      }
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Gerar QR Code do bot
app.get('/api/qr-code', async (req, res) => {
  try {
    const botUsername = process.env.BOT_USERNAME || 'seu_bot';
    const botUrl = `https://t.me/${botUsername}`;
    
    const qrCode = await QRCode.toDataURL(botUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#667eea',
        light: '#ffffff'
      }
    });
    
    res.json({ success: true, qrCode, botUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Endpoint para o BOT enviar novas movimentações (webhook)
app.post('/api/webhook/bot', async (req, res) => {
  try {
    const { tipo, categoria, valor, descricao, usuario_id, data_hora } = req.body;
    
    // Validação básica
    if (!tipo || !valor || !descricao) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios faltando' });
    }
    
    // Aqui você pode inserir no banco se necessário
    // Ou apenas repassar para os clientes WebSocket
    
    // Broadcast para todos os clientes conectados
    const mensagem = {
      type: 'nova_movimentacao',
      data: {
        tipo,
        categoria,
        valor: parseFloat(valor),
        descricao,
        data_hora: data_hora || new Date().toISOString()
      }
    };
    
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(mensagem));
      }
    });
    
    res.json({ success: true, message: 'Movimentação processada' });
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔹 WEBSOCKET SERVER
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('🔗 Novo cliente WebSocket conectado');
  clients.add(ws);
  
  // Enviar mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'Conectado ao SICAF em tempo real'
  }));
  
  ws.on('close', () => {
    console.log('🔌 Cliente WebSocket desconectado');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('❌ Erro no WebSocket:', err);
    clients.delete(ws);
  });
});

// Rota de teste - Raiz da API
app.get('/', (req, res) => {
  res.json({
    message: '✅ SICAF API está rodando!',
    endpoints: {
      dashboard: '/api/dashboard',
      movimentacoes: '/api/movimentacoes',
      qrCode: '/api/qr-code',
      webhook: '/api/webhook/bot'
    },
    timestamp: new Date().toISOString()
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});
// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 API REST rodando em http://localhost:${PORT}`);
  console.log(`📡 WebSocket rodando em ws://localhost:${WS_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Encerrando servidor...');
  clients.forEach(client => client.close());
  await pool.end();
  process.exit(0);
});