#!/bin/bash

echo "🚀 Iniciando Backend e Bot..."

# Vai para a raiz do projeto
cd ~/ControleGasto

# 🔑 Exporta todas as variáveis do .env para o ambiente do shell
# Isso garante que Node e Python recebam as credenciais mesmo rodando em pastas diferentes
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ Variáveis de ambiente carregadas do .env"
else
    echo "❌ Arquivo .env não encontrado na raiz!"
    exit 1
fi

# Inicia o backend (Node.js)
cd backend
screen -dmS backend node server.js
echo "✅ Backend iniciado (screen -r backend)"

# Volta para raiz e inicia o bot (Python)
cd ..
screen -dmS bot python3 bot.py
echo "✅ Bot iniciado (screen -r bot)"

echo ""
echo "🎉 Tudo rodando!"
echo "  - Backend: screen -r backend"
echo "  - Bot:     screen -r bot"
echo "  - Parar:   screen -S backend -X quit && screen -S bot -X quit"