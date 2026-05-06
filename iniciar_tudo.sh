#!/bin/bash

# ============================================================================
# SCRIPT DE INICIALIZAÇÃO - ControleGasto
# Inicia: Backend (Node.js) + Bot (Python) + Frontend (via Node)
# ============================================================================

set -e  # Sai do script se qualquer comando falhar

echo "🚀 Iniciando ControleGasto..."

# Vai para a raiz do projeto
cd "$(dirname "$0")" || exit 1

# ============================================================================
# 1. VALIDAÇÕES PRÉVIAS
# ============================================================================

echo "🔍 Verificando dependências..."

# Verifica se .env existe
if [ ! -f ".env" ]; then
    echo "❌ ERRO: Arquivo .env não encontrado em $(pwd)"
    echo "💡 Crie o arquivo .env com DATABASE_URL e TELEGRAM_BOT_TOKEN"
    exit 1
fi

# Verifica se screen está instalado
if ! command -v screen &> /dev/null; then
    echo "⚠️  screen não instalado. Tentando instalar..."
    sudo apt update && sudo apt install -y screen || {
        echo "❌ Não foi possível instalar screen. Instale manualmente: sudo apt install screen"
        exit 1
    }
fi

# Verifica se node está instalado
if ! command -v node &> /dev/null; then
    echo "❌ ERRO: Node.js não encontrado. Instale com: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
fi

# Verifica se python3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ ERRO: Python3 não encontrado."
    exit 1
fi

echo "✅ Dependências verificadas!"

# ============================================================================
# 2. CARREGAR VARIÁVEIS DE AMBIENTE
# ============================================================================

echo "🔑 Carregando variáveis de ambiente..."

# Exporta variáveis do .env para o ambiente atual
# set -a: exporta automaticamente; set +a: desativa
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ Variáveis carregadas: DATABASE_URL, TELEGRAM_BOT_TOKEN, etc."
fi

# ============================================================================
# 3. INICIAR BACKEND (Node.js + Frontend estático)
# ============================================================================

echo "📦 Iniciando Backend (Node.js)..."

# Mata sessão anterior se existir
screen -S backend -X quit 2>/dev/null || true

# Inicia o backend em screen separado
# O output vai para backend.log para debug
cd backend
screen -dmS backend bash -c "node server.js 2>&1 | tee -a ../backend.log"
sleep 2

# Verifica se o processo subiu
if screen -list | grep -q "backend"; then
    echo "✅ Backend iniciado! Logs: tail -f ../backend.log"
else
    echo "❌ Falha ao iniciar backend. Verifique: cat ../backend.log"
    exit 1
fi

# ============================================================================
# 4. INICIAR BOT (Python)
# ============================================================================

echo "🤖 Iniciando Bot (Python)..."

# Volta para raiz
cd ..

# Mata sessão anterior se existir
screen -S bot -X quit 2>/dev/null || true

# Ativa venv se existir e inicia o bot
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "✅ Virtual environment ativado"
fi

screen -dmS bot bash -c "python3 bot.py 2>&1 | tee -a bot.log"
sleep 2

# Verifica se o processo subiu
if screen -list | grep -q "bot"; then
    echo "✅ Bot iniciado! Logs: tail -f bot.log"
else
    echo "❌ Falha ao iniciar bot. Verifique: cat bot.log"
    exit 1
fi

# ============================================================================
# 5. RESUMO FINAL
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  🎉 ControleGasto iniciado com sucesso!   ║"
echo "╠════════════════════════════════════════════╣"
echo "║  🔗 Frontend:  http://SEU_IP:3001/        ║"
echo "║  🔌 API:       http://SEU_IP:3001/api/    ║"
echo "║  🤖 Bot:       Rodando no Telegram         ║"
echo "╠════════════════════════════════════════════╣"
echo "║  📋 Comandos úteis:                        ║"
echo "║  • Ver backend:  screen -r backend         ║"
echo "║  • Ver bot:      screen -r bot             ║"
echo "║  • Sair do screen: Ctrl+A, depois D        ║"
echo "║  • Parar tudo:   ./parar_tudo.sh           ║"
echo "║  • Ver logs:     tail -f backend.log bot.log ║"
echo "╚════════════════════════════════════════════╝"