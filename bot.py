# Arquivo: bot.py
import telebot
from bd import inserir_gasto, inserir_entrada, listar_gastos, limpar_gastos, total_mes, criar_tabela
from datetime import datetime

TOKEN = "8585855474:AAGcHBkKim7gL4cOzeZVCjuBcPK6kuGFecc"
bot = telebot.TeleBot(TOKEN)

criar_tabela()

@bot.message_handler(commands=["start"])
def start(message):
    bot.reply_to(message, "👋 Olá! Eu sou seu bot de controle de gastos global!\nUse /help para ver os comandos.")


@bot.message_handler(commands=["help"])
def help(message):
    texto = (
        "📌 *Lista de Comandos*\n\n"
        "/start - Inicia o bot\n"
        "/help - Lista comandos\n"
        "/add <desc> <valor> - Adiciona um gasto (ex: /add Lanche 15.50)\n"
        "/saldinc <valor> <desc> - Define uma Entrada/Saldo (ex: /saldinc 1000 Salário)\n"
        "/list - Lista todos os movimentos (Gastos e Entradas)\n"
        "/total - Saldo líquido do mês\n"
        "/resumo - Mostra o Saldo Geral Atual do Mês\n"
        "/clear - Limpa **todos** os registros do banco de dados\n"
    )
    bot.reply_to(message, texto, parse_mode="Markdown")


@bot.message_handler(commands=["add"])
def add_gasto(message):
    try:
        partes = message.text.split(" ", 2)
        if len(partes) < 3:
            return bot.reply_to(message, "❌ Use: /add descrição valor (ex: /add Almoço 35.00)")

        descricao = partes[1]
        valor = float(partes[2].replace(',', '.')) # Permite vírgula ou ponto

        # Sem user_id, apenas descrição e valor
        inserir_gasto(descricao, valor) 

        bot.reply_to(message, f"✔ Gasto registrado: {descricao} - R$ {valor:.2f}")
    except Exception as e:
        print(f"Erro em add_gasto: {e}")
        bot.reply_to(message, "❌ Erro ao adicionar gasto. Certifique-se de que o valor é numérico.")


@bot.message_handler(commands=["saldinc"])
def saldo_inicial(message):
    try:
        partes = message.text.split(" ", 2)
        if len(partes) < 3:
            return bot.reply_to(message, "Use: /saldinc valor descrição (ex: /saldinc 1000 Salário)")

        valor = float(partes[1].replace(',', '.'))
        descricao = partes[2]
        
        # Insere como tipo 'entrada'
        inserir_entrada(descricao, valor)
        
        bot.reply_to(message, f"💰 Entrada registrada: {descricao} - R$ {valor:.2f}")
    except Exception as e:
        print(f"Erro em saldo_inicial: {e}")
        bot.reply_to(message, "❌ Valor ou formato inválido. Use: /saldinc valor descrição")


@bot.message_handler(commands=["list"])
def listar(message):
    # Sem user_id
    movimentos = listar_gastos() 

    if not movimentos:
        return bot.reply_to(message, "Você ainda não registrou nenhum movimento.")

    texto = "📜 *Seus Movimentos:*\n\n"
    for m in movimentos:
        # data é o alias definido no bd.py
        data = m["data"].strftime("%d/%m %H:%M") 
        tipo = "➖ GASTO" if m['tipo'] == 'gasto' else "➕ ENTRADA"
        
        texto += f"[{tipo}] {m['descricao']} — *R$ {m['valor']:.2f}* ({data})\n"

    bot.reply_to(message, texto, parse_mode="Markdown")


@bot.message_handler(commands=["total"])
def total(message):
    # Calcula o saldo líquido do mês
    saldo_liquido = total_mes() 
    bot.reply_to(message, f"📊 Saldo Líquido do Mês Atual: *R$ {saldo_liquido:.2f}*", parse_mode="Markdown")


@bot.message_handler(commands=["clear"])
def clear(message):
    # Limpa todos os movimentos
    limpar_gastos() 
    bot.reply_to(message, "🗑 Todos os movimentos (gastos e entradas) foram apagados!")


@bot.message_handler(commands=["resumo"])
def resumo(message):
    # Usa total_mes() para o resumo
    saldo_total_acumulado = total_mes() 
    
    texto = (
        "📊 *Resumo Mensal Atual*\n\n"
        f"Saldo Líquido no Mês: *R$ {saldo_total_acumulado:.2f}*\n"
        f"*(Entradas do mês - Gastos do mês)*"
    )

    bot.reply_to(message, texto, parse_mode="Markdown")


print("Bot rodando...")
bot.infinity_polling()