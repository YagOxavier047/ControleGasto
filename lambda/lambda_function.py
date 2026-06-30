import os
import json
import pg8000
import urllib.parse
from datetime import datetime, date
from decimal import Decimal

# Função auxiliar para converter datas e decimais para o formato JSON
def json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def lambda_handler(event, context):
    # 1. Pega a string de conexão (A mesma que você usa no bot e no backend)
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return {'statusCode': 500, 'body': json.dumps({'error': 'DATABASE_URL não configurada'})}

    # Parse da URL para extrair host, user, password, etc.
    url = urllib.parse.urlparse(db_url)
    
    try:
        # 2. Conecta ao Aurora (usando ssl_context=True, obrigatório para o RDS)
        conn = pg8000.connect(
            user=url.username,
            password=url.password,
            database=url.path[1:],
            host=url.hostname,
            port=url.port or 5432,
            ssl_context=True 
        )
        cur = conn.cursor()

        # --- QUERYS (Lógica idêntica à do seu server.js) ---
        
        # A. Saldo Total
        cur.execute("SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) FROM movimentos")
        saldo = cur.fetchone()[0]

        # B. Gastos do Mês Atual
        cur.execute("""
            SELECT COALESCE(SUM(valor), 0) FROM movimentos
            WHERE tipo IN ('gasto', 'saida')
            AND EXTRACT(MONTH FROM data_hora) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_hora) = EXTRACT(YEAR FROM CURRENT_DATE)
        """)
        gastos_mes = cur.fetchone()[0]

        # C. Top 5 Categorias de Gastos
        cur.execute("""
            SELECT categoria, SUM(valor) as total, COUNT(*) as qtd FROM movimentos
            WHERE tipo IN ('gasto', 'saida')
            GROUP BY categoria ORDER BY total DESC LIMIT 5
        """)
        categorias = [{'categoria': r[0], 'total': float(r[1]), 'qtd': r[2]} for r in cur.fetchall()]

        # D. Lista de Movimentações (Últimas 50)
        cur.execute("""
            SELECT id, descricao, valor, tipo, categoria, data_hora FROM movimentos
            ORDER BY data_hora DESC LIMIT 50
        """)
        movimentacoes = [
            {
                'id': r[0], 'descricao': r[1], 'valor': float(r[2]), 
                'tipo': r[3], 'categoria': r[4], 'data_hora': r[5]
            } for r in cur.fetchall()
        ]

        # 3. Devolve o JSON estruturado para o Power BI ler facilmente
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'success': True,
                'data': {
                    'dashboard': {
                        'saldo': float(saldo),
                        'gastosMes': float(gastos_mes),
                        'categorias': categorias
                    },
                    'movimentacoes': movimentacoes
                }
            }, default=json_serial)
        }

    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'success': False, 'error': str(e)})}
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()