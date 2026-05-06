// backend/database.js
require('dotenv').config();
const { Pool } = require('pg');

// ============================================================================
// CONFIGURAÇÃO DA CONEXÃO COM POSTGRESQL (AWS RDS)
// ============================================================================

// 1. Valida se a variável de ambiente está configurada
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    '❌ DATABASE_URL não configurada.\n' +
    'Defina a variável de ambiente DATABASE_URL com a string de conexão do PostgreSQL.\n' +
    'Exemplo: postgresql://user:pass@host:5432/dbname?sslmode=require'
  );
}

// 2. Garante que sslmode=require esteja presente (obrigatório para RDS)
let finalConnectionString = connectionString;
if (finalConnectionString.includes('?')) {
  if (!finalConnectionString.toLowerCase().includes('sslmode')) {
    finalConnectionString += '&sslmode=require';
  }
} else {
  finalConnectionString += '?sslmode=require';
}

// 3. Configurações do pool de conexões
require('dotenv').config();
const { Pool } = require('pg');

// Configuração do pool com SSL flexível para RDS
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// SSL apenas se for conexão PostgreSQL (RDS)
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('amazonaws.com')) {
  poolConfig.ssl = {
    rejectUnauthorized: false  // Aceita certificados do RDS
  };
}

const pool = new Pool(poolConfig);

// 5. Logger interno para queries (opcional - pode ser desativado em produção)
const LOG_QUERIES = process.env.LOG_DB_QUERIES === 'true';

// ============================================================================
// FUNÇÕES EXPORTADAS
// ============================================================================

/**
 * Executa uma query no banco de dados
 * @param {string} text - Query SQL com parâmetros $1, $2, etc.
 * @param {Array} params - Array de valores para os parâmetros
 * @returns {Promise<pg.QueryResult>} Resultado da query
 */
const query = async (text, params) => {
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    
    if (LOG_QUERIES) {
      const duration = Date.now() - start;
      console.log('🔍 Query executada:', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params?.length || 0,
        rows: res.rowCount,
        duration: `${duration}ms`
      });
    }
    
    return res;
  } catch (err) {
    console.error('❌ Erro na query:', {
      message: err.message,
      code: err.code,
      text: text.substring(0, 100)
    });
    throw err; // Re-lança para a camada superior tratar
  }
};

/**
 * Obtém um cliente do pool para transações manuais
 * @returns {Promise<pg.PoolClient>} Cliente do pool
 */
const getClient = () => pool.connect();

/**
 * Fecha todas as conexões do pool (para graceful shutdown)
 * @returns {Promise<void>}
 */
const close = async () => {
  console.log('🔄 Fechando pool de conexões...');
  await pool.end();
  console.log('✅ Pool de conexões fechado');
};

/**
 * Testa a conexão com o banco (health check)
 * @returns {Promise<boolean>} True se conectado, false caso contrário
 */
const healthCheck = async () => {
  try {
    await query('SELECT 1 as connected');
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// EVENTOS DO POOL (LOGS OPCIONAIS)
// ============================================================================

pool.on('connect', () => {
  if (LOG_QUERIES) console.log('🔗 Nova conexão estabelecida no pool');
});

pool.on('acquire', (client) => {
  if (LOG_QUERIES) console.log('📥 Conexão adquirida do pool');
});

pool.on('release', (err, client) => {
  if (err) {
    console.error('❌ Erro ao liberar conexão:', err.message);
  } else if (LOG_QUERIES) {
    console.log('📤 Conexão liberada de volta ao pool');
  }
});

pool.on('error', (err, client) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err.message);
  // Não fecha o processo, mas loga para diagnóstico
});

// ============================================================================
// TESTE DE CONEXÃO AO INICIAR (apenas em desenvolvimento)
// ============================================================================

if (process.env.NODE_ENV !== 'production' || process.env.TEST_DB_ON_START === 'true') {
  (async () => {
    try {
      await healthCheck();
      console.log('✅ Pool PostgreSQL inicializado com SSL | Conexão validada');
    } catch (err) {
      console.error('❌ Falha ao validar conexão com o banco:', err.message);
      // Não encerra o processo para permitir retry em ambientes cloud
    }
  })();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  query,
  getClient,
  close,
  healthCheck,
  pool
};