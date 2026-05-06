# Arquivo: bd.py
import psycopg2
import os
import logging
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Connection string do AWS RDS (via variável de ambiente)
CONNECTION_STRING = os.getenv("DATABASE_URL")

if not CONNECTION_STRING:
    raise RuntimeError(
        "DATABASE_URL não configurada. "
        "Defina a variável de ambiente DATABASE_URL com a string de conexão do PostgreSQL."
    )

# Garante SSL na conexão (obrigatório para RDS)
if "?" in CONNECTION_STRING:
    if "sslmode" not in CONNECTION_STRING:
        CONNECTION_STRING += "&sslmode=require"
else:
    CONNECTION_STRING += "?sslmode=require"


def conectar():
    """Retorna uma nova conexão com o banco."""
    try:
        conn = psycopg2.connect(CONNECTION_STRING)
        logger.info("Conexão com banco de dados estabelecida com sucesso")
        return conn
    except psycopg2.OperationalError as e:
        logger.error(f"Falha ao conectar ao banco de dados: {e}")
        raise


def criar_tabela():
    """Cria as tabelas necessárias."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()

        # Tabela de movimentos
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS movimentos (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(20) CHECK (tipo IN ('entrada', 'gasto')) NOT NULL,
                categoria VARCHAR(100) DEFAULT 'Geral',
                valor DECIMAL(10,2) NOT NULL,
                descricao VARCHAR(255) NOT NULL,
                data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabela de orçamento mensal
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orcamento (
                id SERIAL PRIMARY KEY,
                mes_ano VARCHAR(7) NOT NULL,
                limite DECIMAL(10,2) NOT NULL,
                UNIQUE (mes_ano)
            )
        """)

        db.commit()
        logger.info("Tabelas criadas/validadas com sucesso")
    except Exception as e:
        logger.error(f"Erro ao criar tabelas: {e}")
        if db:
            db.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def inserir_gasto(descricao, valor, categoria='Geral'):
    """Insere um gasto com categoria."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO movimentos (tipo, categoria, valor, descricao) 
            VALUES ('gasto', %s, %s, %s)
        """, (categoria, valor, descricao))
        db.commit()
        logger.info(f"Gasto inserido: {descricao} - R$ {valor}")
    except Exception as e:
        logger.error(f"Erro ao inserir gasto: {e}")
        if db:
            db.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def inserir_entrada(descricao, valor):
    """Insere uma entrada."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO movimentos (tipo, valor, descricao)
            VALUES ('entrada', %s, %s)
        """, (valor, descricao))
        db.commit()
        logger.info(f"Entrada inserida: {descricao} - R$ {valor}")
    except Exception as e:
        logger.error(f"Erro ao inserir entrada: {e}")
        if db:
            db.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def listar_gastos(mes=None):
    """Lista movimentos, opcionalmente filtrando por mês."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        if mes:
            cursor.execute("""
                SELECT tipo, categoria, valor, descricao, data_hora as data
                FROM movimentos
                WHERE TO_CHAR(data_hora, 'YYYY-MM') = %s
                ORDER BY data_hora DESC
            """, (mes,))
        else:
            cursor.execute("""
                SELECT tipo, categoria, valor, descricao, data_hora as data
                FROM movimentos
                ORDER BY data_hora DESC
            """)
        
        resultados = cursor.fetchall()
        logger.info(f"Listados {len(resultados)} movimentos")
        return resultados
    except Exception as e:
        logger.error(f"Erro ao listar gastos: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def get_categorias_mes():
    """Retorna gastos agrupados por categoria no mês atual."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT categoria, SUM(valor) as total
            FROM movimentos
            WHERE tipo = 'gasto'
            AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY categoria
            ORDER BY total DESC
        """)
        resultados = cursor.fetchall()
        return resultados
    except Exception as e:
        logger.error(f"Erro ao buscar categorias do mês: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def detalhes_mes():
    """Retorna entradas, gastos e saldo do mês atual."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        cursor.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS total_entradas,
                COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN valor ELSE 0 END), 0) AS total_gastos
            FROM movimentos
            WHERE EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
        """)
        resultado = cursor.fetchone()
        entradas = float(resultado[0]) if resultado and resultado[0] else 0.0
        gastos = float(resultado[1]) if resultado and resultado[1] else 0.0
        return entradas, gastos, entradas - gastos
    except Exception as e:
        logger.error(f"Erro ao buscar detalhes do mês: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def saldo_disponivel():
    """Calcula saldo disponível de todo o histórico."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        cursor.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN valor ELSE 0 END), 0) AS saldo
            FROM movimentos
        """)
        resultado = cursor.fetchone()
        saldo = float(resultado[0]) if resultado and resultado[0] else 0.0
        return saldo
    except Exception as e:
        logger.error(f"Erro ao calcular saldo disponível: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def set_orcamento(limite):
    """Define orçamento para o mês atual."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        mes_atual = datetime.now().strftime('%Y-%m')
        cursor.execute("""
            INSERT INTO orcamento (mes_ano, limite) 
            VALUES (%s, %s)
            ON CONFLICT (mes_ano) DO UPDATE SET limite = %s
        """, (mes_atual, limite, limite))
        db.commit()
        logger.info(f"Orçamento definido para {mes_atual}: R$ {limite}")
    except Exception as e:
        logger.error(f"Erro ao definir orçamento: {e}")
        if db:
            db.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def get_orcamento():
    """Retorna orçamento do mês atual."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        mes_atual = datetime.now().strftime('%Y-%m')
        cursor.execute("SELECT limite FROM orcamento WHERE mes_ano = %s", (mes_atual,))
        resultado = cursor.fetchone()
        return float(resultado[0]) if resultado else None
    except Exception as e:
        logger.error(f"Erro ao buscar orçamento: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()


def limpar_gastos():
    """Apaga todos os registros."""
    db = None
    cursor = None
    try:
        db = conectar()
        cursor = db.cursor()
        cursor.execute("DELETE FROM movimentos")
        db.commit()
        logger.info("Todos os registros de movimentos foram apagados")
    except Exception as e:
        logger.error(f"Erro ao limpar gastos: {e}")
        if db:
            db.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if db:
            db.close()