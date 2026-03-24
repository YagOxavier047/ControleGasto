# Arquivo: bd.py
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Connection string do Neon
CONNECTION_STRING = "postgresql://neondb_owner:npg_VEh6xyGT5WLs@ep-rapid-hat-ang1jm60-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

def conectar():
    """Retorna uma nova conexão com o banco."""
    return psycopg2.connect(CONNECTION_STRING)

def criar_tabela():
    """Cria as tabelas necessárias."""
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
    cursor.close()
    db.close()

def inserir_gasto(descricao, valor, categoria='Geral'):
    """Insere um gasto com categoria."""
    db = conectar()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO movimentos (tipo, categoria, valor, descricao) 
        VALUES ('gasto', %s, %s, %s)
    """, (categoria, valor, descricao))
    db.commit()
    cursor.close()
    db.close()

def inserir_entrada(descricao, valor):
    """Insere uma entrada."""
    db = conectar()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO movimentos (tipo, valor, descricao)
        VALUES ('entrada', %s, %s)
    """, (valor, descricao))
    db.commit()
    cursor.close()
    db.close()

def listar_gastos(mes=None):
    """Lista movimentos, opcionalmente filtrando por mês."""
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
    cursor.close()
    db.close()
    return resultados

def get_categorias_mes():
    """Retorna gastos agrupados por categoria no mês atual."""
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
    cursor.close()
    db.close()
    return resultados

def detalhes_mes():
    """Retorna entradas, gastos e saldo do mês atual."""
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
    cursor.close()
    db.close()
    return entradas, gastos, entradas - gastos

def saldo_disponivel():
    """Calcula saldo disponível de todo o histórico."""
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
    cursor.close()
    db.close()
    return saldo

def set_orcamento(limite):
    """Define orçamento para o mês atual."""
    db = conectar()
    cursor = db.cursor()
    mes_atual = datetime.now().strftime('%Y-%m')
    cursor.execute("""
        INSERT INTO orcamento (mes_ano, limite) 
        VALUES (%s, %s)
        ON CONFLICT (mes_ano) DO UPDATE SET limite = %s
    """, (mes_atual, limite, limite))
    db.commit()
    cursor.close()
    db.close()

def get_orcamento():
    """Retorna orçamento do mês atual."""
    db = conectar()
    cursor = db.cursor()
    mes_atual = datetime.now().strftime('%Y-%m')
    cursor.execute("SELECT limite FROM orcamento WHERE mes_ano = %s", (mes_atual,))
    resultado = cursor.fetchone()
    cursor.close()
    db.close()
    return float(resultado[0]) if resultado else None

def limpar_gastos():
    """Apaga todos os registros."""
    db = conectar()
    cursor = db.cursor()
    cursor.execute("DELETE FROM movimentos")
    db.commit()
    cursor.close()
    db.close()