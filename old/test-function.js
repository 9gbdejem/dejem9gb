// Teste LOCAL - só funciona com Netlify CLI
const fetch = require('node-fetch');

async function testFunction() {
    try {
        const response = await fetch('http://localhost:8888/.netlify/functions/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: 'test@test.com', 
                mensagem: 'Teste de função',
                nome: 'Teste',
                assunto: 'Teste'
            })
        });
        
        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Resposta:', data);
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

testFunction();