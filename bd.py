# Arquivo: bd.py
import mysql.connector
from datetime import datetime

def conectar():
    """Conecta ao banco de dados MySQL."""
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="Midmid1064@",
        database="bot_gastos"
    )

def criar_tabela():
    """Cria as tabelas necessárias."""
    db = conectar()
    cursor = db.cursor()

    # Tabela de movimentos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS movimentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tipo ENUM('entrada', 'gasto') NOT NULL,
            categoria VARCHAR(100) DEFAULT 'Geral',
            valor DECIMAL(10,2) NOT NULL,
            descricao VARCHAR(255) NOT NULL,
            data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Tabela de orçamento mensal
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orcamento (
            id INT AUTO_INCREMENT PRIMARY KEY,
            mes_ano VARCHAR(7) NOT NULL,
            limite DECIMAL(10,2) NOT NULL,
            UNIQUE KEY unique_mes (mes_ano)
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
    cursor = db.cursor(dictionary=True)
    
    if mes:
        cursor.execute("""
            SELECT tipo, categoria, valor, descricao, data_hora as data
            FROM movimentos
            WHERE DATE_FORMAT(data_hora, '%Y-%m') = %s
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
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT categoria, SUM(valor) as total
        FROM movimentos
        WHERE tipo = 'gasto'
        AND MONTH(data_hora) = MONTH(CURDATE())
        AND YEAR(data_hora) = YEAR(CURDATE())
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
        WHERE MONTH(data_hora) = MONTH(CURDATE())
        AND YEAR(data_hora) = YEAR(CURDATE())
    """)
    resultado = cursor.fetchone()
    entradas = float(resultado[0]) if resultado[0] else 0.0
    gastos = float(resultado[1]) if resultado[1] else 0.0
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
    saldo = float(resultado[0]) if resultado[0] else 0.0
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
        ON DUPLICATE KEY UPDATE limite = %s
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