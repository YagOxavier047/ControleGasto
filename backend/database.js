require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('❌ DATABASE_URL não configurada.');
}

// Configura pool com SSL para RDS
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined  // ← IGNORA VALIDAÇÃO SSL
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err.message);
  } else {
    console.log('✅ Banco conectado!');
    release();
  }
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('❌ Erro na query:', err.message);
    throw err;
  }
};

const close = async () => {
  await pool.end();
};

const healthCheck = async () => {
  try {
    await query('SELECT 1 as connected');
    return true;
  } catch {
    return false;
  }
};

module.exports = { query, pool, close, healthCheck };