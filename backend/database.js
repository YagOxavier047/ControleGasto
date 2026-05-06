// backend/database.js
require('dotenv').config();
const { Pool } = require('pg');

// Valida DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    '❌ DATABASE_URL não configurada.\n' +
    'Defina a variável de ambiente DATABASE_URL.'
  );
}

// Configura pool com SSL para RDS
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,        // Aceita certificados autoassinados
    checkServerIdentity: () => undefined  // Ignora validação de hostname do certificado
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Testa conexão ao iniciar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar no banco:', err.message);
  } else {
    console.log('✅ Banco de dados conectado!');
    release();
  }
});

// Função query
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    console.log('🔍 Query executada:', {
      text: text.substring(0, 100),
      duration: `${Date.now() - start}ms`,
      rows: res.rowCount
    });
    return res;
  } catch (err) {
    console.error('❌ Erro na query:', err.message);
    throw err;
  }
};

// Fecha conexões (para graceful shutdown)
const close = async () => {
  console.log('🔄 Fechando pool de conexões...');
  await pool.end();
  console.log('✅ Pool fechado');
};

// Health check
const healthCheck = async () => {
  try {
    await query('SELECT 1 as connected');
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  query,
  pool,
  close,
  healthCheck
};