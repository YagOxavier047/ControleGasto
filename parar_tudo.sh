#!/bin/bash
echo "🛑 Parando ControleGasto..."
screen -S backend -X quit 2>/dev/null && echo "✅ Backend parado"
screen -S bot -X quit 2>/dev/null && echo "✅ Bot parado"
echo "👋 Tudo parado!"