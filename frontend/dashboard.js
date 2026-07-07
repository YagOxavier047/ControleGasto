// ANTES (errado):
fetch(`${API_URL}/controle-gastos-powerbi`)

// DEPOIS (certo):
fetch(`${API_URL}/api/dashboard`)              // GET
fetch(`${API_URL}/api/dashboard/atualizar`)    // POST