# Arquivo: bot.py
import telebot
import os
import time
import io
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from bd import (
    inserir_gasto, inserir_entrada, listar_gastos, 
    limpar_gastos, detalhes_mes, criar_tabela,
    saldo_disponivel, get_categorias_mes,
    set_orcamento, get_orcamento
)

# ⚠️ Use variável de ambiente ou insira seu token novo aqui
TOKEN = "8585855474:AAFunl2wnS-rYfSXhtd0jIxlA3aqPygso6w"  # ← Substitua pelo token gerado no BotFather
bot = telebot.TeleBot(TOKEN)

criar_tabela()

# Categorias pré-definidas
CATEGORIAS = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 
              'Saúde', 'Educação', 'Vestuário', 'Outros']

@bot.message_handler(commands=["start"])
def start(message):
    saldo = saldo_disponivel()
    bot.reply_to(message, 
        f"👋 *Bot de Controle Financeiro*\n\n"
        f"💰 Saldo Disponível: *R$ {saldo:.2f}*\n"
        f"Use /ajuda para ver os comandos", 
        parse_mode="Markdown"
    )

@bot.message_handler(commands=["ajuda"])  # /help → /ajuda
def ajuda(message):
    texto = (
        "📌 *COMANDOS DISPONÍVEIS*\n\n"
        "💰 *Movimentações:*\n"
        "/despesa <cat> <desc> <valor> - Registrar gasto\n"
        "/receita <valor> <desc> - Registrar entrada\n"
        "/movimentos - Ver extrato do mês\n"
        "/categorias - Gastos por categoria\n\n"
        "📊 *Relatórios:*\n"
        "/relatorio - Resumo completo do mês\n"
        "/baixar - Gerar extrato em PDF\n\n"
        "⚙️ *Configurações:*\n"
        "/meta <valor> - Definir limite mensal\n"
        "/limpar - Apagar todos os dados\n"
        "/ajuda - Esta mensagem"
    )
    bot.reply_to(message, texto, parse_mode="Markdown")

@bot.message_handler(commands=["despesa"])  # /add → /despesa
def registrar_despesa(message):
    try:
        partes = message.text.split()
        if len(partes) < 4:
            return bot.reply_to(message, 
                "❌ Use: /despesa <categoria> <descrição> <valor>\n"
                f"Categorias: {', '.join(CATEGORIAS)}\n"
                "Ex: /despesa Alimentação Almoço 35.00")
        
        categoria = partes[1]
        if categoria not in CATEGORIAS:
            return bot.reply_to(message, 
                f"❌ Categoria inválida. Use: {', '.join(CATEGORIAS)}")
        
        descricao = partes[2]
        valor = float(partes[3].replace(',', '.'))
        
        saldo_atual = saldo_disponivel()
        if saldo_atual < valor:
            return bot.reply_to(message, 
                f"❌ *Saldo insuficiente!*\n"
                f"Disponível: R$ {saldo_atual:.2f}\n"
                f"Necessário: R$ {valor:.2f}")
        
        inserir_gasto(descricao, valor, categoria)
        
        # Verificar orçamento
        limite = get_orcamento()
        _, gastos_mes, _ = detalhes_mes()
        
        msg = f"✔ *Despesa registrada!*\n"
        msg += f"📁 Categoria: {categoria}\n"
        msg += f"📝 {descricao} - R$ {valor:.2f}\n"
        msg += f"💳 Saldo: R$ {saldo_disponivel():.2f}"
        
        if limite and gastos_mes > (limite * 0.8):
            msg += f"\n\n⚠️ *ALERTA*: Você já gastou {((gastos_mes/limite)*100):.1f}% da meta!"
        
        bot.reply_to(message, msg, parse_mode="Markdown")
        
    except ValueError:
        bot.reply_to(message, "❌ Valor inválido. Use números (ex: 35.00 ou 35,00)")
    except Exception as e:
        print(f"Erro: {e}")
        bot.reply_to(message, "❌ Erro ao registrar despesa")

@bot.message_handler(commands=["receita"])  # /saldinc → /receita
def registrar_receita(message):
    try:
        partes = message.text.split(" ", 2)
        if len(partes) < 3:
            return bot.reply_to(message, "Use: /receita <valor> <descrição>")
        
        valor = float(partes[1].replace(',', '.'))
        descricao = partes[2]
        
        inserir_entrada(descricao, valor)
        bot.reply_to(message, 
            f"💰 *Receita registrada!*\n"
            f"{descricao} - R$ {valor:.2f}\n"
            f"Saldo atual: R$ {saldo_disponivel():.2f}",
            parse_mode="Markdown"
        )
    except:
        bot.reply_to(message, "❌ Formato inválido")

@bot.message_handler(commands=["movimentos"])  # /list → /movimentos
def ver_movimentos(message):
    movimentos = listar_gastos()
    if not movimentos:
        return bot.reply_to(message, "Nenhuma movimentação este mês.")
    
    texto = "📜 *Extrato do Mês*\n\n"
    for m in movimentos:
        data = m["data"].strftime("%d/%m")
        tipo = "➖" if m['tipo'] == 'gasto' else "➕"
        cat = m.get('categoria', 'Geral')
        texto += f"{tipo} [{cat}] {m['descricao']} - *R$ {m['valor']:.2f}* ({data})\n"
    
    bot.reply_to(message, texto, parse_mode="Markdown")

@bot.message_handler(commands=["categorias"])
def ver_categorias(message):
    cats = get_categorias_mes()
    if not cats:
        return bot.reply_to(message, "Sem gastos categorizados este mês.")
    
    texto = "📊 *Gastos por Categoria*\n\n"
    for c in cats:
        texto += f"📁 {c['categoria']}: *R$ {c['total']:.2f}*\n"
    
    bot.reply_to(message, texto, parse_mode="Markdown")

@bot.message_handler(commands=["relatorio"])  # /total → /relatorio
def ver_relatorio(message):
    entradas, gastos, saldo = detalhes_mes()
    saldo_geral = saldo_disponivel()
    limite = get_orcamento()
    
    texto = (
        f"📊 *RELATÓRIO DO MÊS*\n\n"
        f"➕ Receitas: R$ {entradas:.2f}\n"
        f"➖ Despesas: R$ {gastos:.2f}\n"
        f"{'─' * 30}\n"
        f"📈 Saldo do Mês: R$ {saldo:.2f}\n"
        f"💰 Saldo Total: R$ {saldo_geral:.2f}\n"
    )
    
    if limite:
        pct = (gastos/limite)*100 if limite > 0 else 0
        texto += f"\n🎯 Meta: R$ {limite:.2f}\n"
        texto += f"📊 Utilizado: {pct:.1f}%\n"
        if pct > 100:
            texto += "🚨 *META ESTOURADA!*"
        elif pct > 80:
            texto += "⚠️ *Atenção: Quase no limite!*"
    
    bot.reply_to(message, texto, parse_mode="Markdown")

@bot.message_handler(commands=["baixar"])  # /pdf → /baixar
def baixar_pdf(message):
    try:
        movimentos = listar_gastos()
        if not movimentos:
            return bot.reply_to(message, "Sem dados para gerar PDF.")
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elementos = []
        estilos = getSampleStyleSheet()
        
        elementos.append(Paragraph("EXTRATO FINANCEIRO", estilos['Title']))
        elementos.append(Spacer(1, 12))
        elementos.append(Paragraph(f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}", estilos['Normal']))
        elementos.append(Spacer(1, 12))
        
        entradas, gastos, saldo = detalhes_mes()
        elementos.append(Paragraph(f"Total Receitas: R$ {entradas:.2f}", estilos['Normal']))
        elementos.append(Paragraph(f"Total Despesas: R$ {gastos:.2f}", estilos['Normal']))
        elementos.append(Paragraph(f"Saldo: R$ {saldo:.2f}", estilos['Normal']))
        elementos.append(Spacer(1, 12))
        
        dados = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor']]
        for m in movimentos:
            tipo = 'Despesa' if m['tipo'] == 'gasto' else 'Receita'
            cat = m.get('categoria', 'Geral')
            dados.append([
                m['data'].strftime('%d/%m'),
                tipo,
                cat,
                m['descricao'],
                f"R$ {m['valor']:.2f}"
            ])
        
        tabela = Table(dados)
        tabela.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        elementos.append(tabela)
        doc.build(elementos)
        buffer.seek(0)
        
        bot.send_document(message.chat.id, buffer, 
                         visible_file_name=f"extrato_{datetime.now().strftime('%Y%m')}.pdf")
        buffer.close()
        
    except Exception as e:
        print(f"Erro PDF: {e}")
        bot.reply_to(message, "❌ Erro ao gerar PDF")

@bot.message_handler(commands=["meta"])  # /orcamento → /meta
def definir_meta(message):
    try:
        partes = message.text.split()
        if len(partes) < 2:
            return bot.reply_to(message, "Use: /meta <valor>")
        
        limite = float(partes[1].replace(',', '.'))
        set_orcamento(limite)
        bot.reply_to(message, 
            f"✅ Meta definida: *R$ {limite:.2f}*", 
            parse_mode="Markdown"
        )
    except:
        bot.reply_to(message, "❌ Valor inválido")

@bot.message_handler(commands=["limpar"])  # /clear → /limpar
def limpar_tudo(message):
    limpar_gastos()
    bot.reply_to(message, "🗑 Todos os dados foram apagados!")

# 🔁 Loop com reconexão automática
print("🔄 Conectando ao Telegram...")

while True:
    try:
        me = bot.get_me()
        print(f"✅ Bot conectado: @{me.username}")
        print("🚀 Aguardando comandos...")
        bot.infinity_polling()
    except Exception as e:
        print(f"❌ Erro de conexão: {e}")
        print("🔄 Reconectando em 5 segundos...")
        time.sleep(5)