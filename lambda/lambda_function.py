import json
from datetime import datetime

def lambda_handler(event, context):
    # Dados fictícios para teste
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'success': True,
            'data': {
                'dashboard': {
                    'saldo': 15000.50,
                    'gastosMes': 3250.75,
                    'categorias': [
                        {'categoria': 'Alimentação', 'total': 1200.00, 'qtd': 15},
                        {'categoria': 'Transporte', 'total': 850.50, 'qtd': 22},
                        {'categoria': 'Lazer', 'total': 650.25, 'qtd': 8},
                        {'categoria': 'Moradia', 'total': 550.00, 'qtd': 1}
                    ]
                },
                'movimentacoes': [
                    {'id': 1, 'descricao': 'Supermercado', 'valor': 350.00, 'tipo': 'gasto', 'categoria': 'Alimentação', 'data_hora': datetime.now().isoformat()},
                    {'id': 2, 'descricao': 'Salário', 'valor': 5000.00, 'tipo': 'entrada', 'categoria': 'Renda', 'data_hora': datetime.now().isoformat()},
                    {'id': 3, 'descricao': 'Uber', 'valor': 25.50, 'tipo': 'gasto', 'categoria': 'Transporte', 'data_hora': datetime.now().isoformat()}
                ]
            }
        })
    }