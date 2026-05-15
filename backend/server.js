const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Rota da API: Dashboard
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

    // Total Histórico de Receitas (Para o Gráfico)
    const totalReceitasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo = 'entrada'
    `);

    // Total Histórico de Despesas (Para o Gráfico)
    const totalDespesasResult = await query(`
      SELECT COALESCE(SUM(valor), 0) as total 
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
    `);
    
    // Categorias mais gastas (Top 5)
    const categoriasResult = await query(`
      SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
      FROM movimentos 
      WHERE tipo IN ('gasto', 'saida')
      GROUP BY categoria
      ORDER BY total DESC
      LIMIT 5
    `);

    // CORREÇÃO AQUI: Estrutura correta do JSON com a chave 'data'
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

// Rota da API: Listar Movimentações
app.get('/api/movimentos', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, descricao, valor, tipo, categoria, data_hora
      FROM movimentos
      ORDER BY data_hora DESC
      LIMIT 50
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota da API: Adicionar Movimentação
app.post('/api/movimentos', async (req, res) => {
  const { descricao, valor, tipo, categoria, data_hora } = req.body;
  try {
    const result = await query(
      `INSERT INTO movimentos (descricao, valor, tipo, categoria, data_hora)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [descricao, valor, tipo, categoria, data_hora || new Date()]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota da API: Deletar Movimentação
app.delete('/api/movimentos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM movimentos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve o frontend para qualquer outra rota
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});