const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

// Configuração do Pool de Conexão PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função auxiliar para queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executado query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Erro na query', error);
    throw error;
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ===== ROTAS DA API (ANTES DO CATCH-ALL) =====

// Rota da API: Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
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

    const totalReceitasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo = 'entrada'
    `);

    const totalDespesasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
    `);
    
    const categoriasResult = await query(`
      SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
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
        totalReceitas: parseFloat(totalReceitasResult.rows[0].total),
        totalDespesas: parseFloat(totalDespesasResult.rows[0].total),
        categorias: categoriasResult.rows.map(row => ({
          categoria: row.categoria,
          total: parseFloat(row.total),
          qtd: row.qtd
        }))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Rota da API: Listar Movimentações (CORRIGIDO: nome da rota)
app.get('/api/movimentacoes', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, descricao, valor, tipo, categoria, data_hora
      FROM movimentos
      ORDER BY data_hora DESC
      LIMIT 50
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota da API: Adicionar Movimentação
app.post('/api/movimentacoes', async (req, res) => {
  const { descricao, valor, tipo, categoria, data_hora } = req.body;
  try {
    const result = await query(
      `INSERT INTO movimentos (descricao, valor, tipo, categoria, data_hora)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [descricao, valor, tipo, categoria, data_hora || new Date()]
    );
    
    // Notifica via WebSocket
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'nova_movimentacao',
            data: result.rows[0]
          }));
        }
      });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao adicionar movimentação:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota da API: Deletar Movimentação
app.delete('/api/movimentacoes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM movimentos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar movimentação:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota da API: QR Code (NOVA ROTA)
app.get('/api/qr-code', async (req, res) => {
  try {
    // Gera URL do bot (substitua pelo seu username real)
    const botUsername = 'seu_bot_username'; // ← COLOQUE SEU BOT AQUI
    const botUrl = `https://t.me/${botUsername}`;
    
    // Gera QR Code em base64 (usando API pública)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(botUrl)}`;
    
    res.json({
      success: true,
      qrCode: qrCodeUrl,
      botUrl: botUrl
    });
  } catch (error) {
    console.error('Erro ao gerar QR Code:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar QR Code' });
  }
});

// Serve o frontend para qualquer outra rota (POR ÚLTIMO!)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===== SERVIDOR HTTP + WEBSOCKET =====
const server = http.createServer(app);

// WebSocket Server na porta 8080
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('✅ Cliente WebSocket conectado');
  
  ws.on('close', () => {
    console.log('🔌 Cliente WebSocket desconectado');
  });
  
  ws.on('error', (err) => {
    console.error('❌ Erro no WebSocket:', err);
  });
});

console.log(`🚀 WebSocket rodando em ws://localhost:${WS_PORT}`);

// Iniciar servidor HTTP
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor HTTP rodando em http://0.0.0.0:${PORT}`);
});