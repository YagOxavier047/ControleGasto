# Arquivo: bd.py
import mysql.connector
from datetime import datetime

# --- Configuração de Conexão ---
def conectar():
    """Conecta ao banco de dados MySQL."""
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="Midmid1064@", # **IMPORTANTE:** Mantenha sua senha segura!
        database="bot_gastos"
    )

# --- Funções de Estrutura e Movimentação ---

def criar_tabela():
    """Cria a tabela 'movimentos' se ela não existir (função de inicialização)."""
    db = conectar()
    cursor = db.cursor()

    # O SQL foi incluído no comando principal no terminal, mas é bom mantê-lo aqui
    # para garantir que a tabela existe se for executado localmente.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS movimentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tipo ENUM('entrada', 'gasto') NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            descricao VARCHAR(255) NOT NULL,
            data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db.commit()
    cursor.close()
    db.close()


def inserir_gasto(descricao, valor):
    """Insere um novo registro de 'gasto' (usado pelo comando /add)."""
    db = conectar()
    cursor = db.cursor()

    cursor.execute("""
        INSERT INTO movimentos (tipo, valor, descricao) 
        VALUES ('gasto', %s, %s)
    """, (valor, descricao)) # O SQL espera (valor, descrição)

    db.commit()
    cursor.close()
    db.close()


def inserir_entrada(descricao, valor):
    """Insere um novo registro de 'entrada' (usado pelo comando /saldinc)."""
    db = conectar()
    cursor = db.cursor()

    cursor.execute("""
        INSERT INTO movimentos (tipo, valor, descricao)
        VALUES ('entrada', %s, %s)
    """, (valor, descricao))

    db.commit()
    cursor.close()
    db.close()


def listar_gastos():
    """Lista todos os movimentos (gastos e entradas) para o comando /list."""
    db = conectar()
    # Usamos dictionary=True para retornar resultados como dicionários, facilitando o uso no bot.py
    cursor = db.cursor(dictionary=True) 

    cursor.execute("""
        SELECT tipo, valor, descricao, data_hora as data
        FROM movimentos
        ORDER BY data_hora DESC
    """)

    resultados = cursor.fetchall()
    
    cursor.close()
    db.close()
    return resultados


def limpar_gastos():
    """Apaga todos os registros da tabela 'movimentos' para o comando /clear."""
    db = conectar()
    cursor = db.cursor()

    cursor.execute("DELETE FROM movimentos")

    db.commit()
    cursor.close()
    db.close()


def total_mes():
    """Calcula o Saldo Líquido (Entradas - Gastos) do mês atual para o comando /total e /resumo."""
    db = conectar()
    cursor = db.cursor()

    cursor.execute("""
        SELECT 
            SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) -
            SUM(CASE WHEN tipo = 'gasto' THEN valor ELSE 0 END) AS saldo_liquido
        FROM movimentos
        WHERE MONTH(data_hora) = MONTH(CURDATE())
        AND YEAR(data_hora) = YEAR(CURDATE())
    """)

    # Pega o primeiro resultado da tupla e retorna 0.0 se for nulo
    resultado = cursor.fetchone() 
    saldo = resultado[0] if resultado and resultado[0] is not None else 0.0

    cursor.close()
    db.close()
    return saldo