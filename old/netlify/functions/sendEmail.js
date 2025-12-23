const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Habilita CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const { email, nome, senhaTemporaria } = JSON.parse(event.body);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { 
          name: 'DEJEM - 9º GB', 
          email: '9gbdejem@gmail.com' 
        },
        to: [{ email, name: nome }],
        subject: 'Senha Temporária - DEJEM 9º GB',
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 20px; }
              .senha { 
                background: #e8f4ff; 
                padding: 15px; 
                text-align: center; 
                font-size: 24px; 
                font-weight: bold;
                margin: 20px 0;
                border-radius: 5px;
                border: 2px dashed #0066cc;
              }
              .footer { text-align: center; margin-top: 20px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>DEJEM - 9º GB</h1>
              </div>
              <div class="content">
                <h2>Olá, ${nome}!</h2>
                <p>Você solicitou uma senha temporária para acesso ao sistema.</p>
                <p>Sua senha temporária é:</p>
                <div class="senha">${senhaTemporaria}</div>
                <p><strong>Instruções de uso:</strong></p>
                <ol>
                  <li>Acesse o sistema com seu número de RE</li>
                  <li>Use a senha temporária acima para fazer login</li>
                  <li>Você será redirecionado para criar uma nova senha pessoal</li>
                </ol>
                <p><em>Esta senha é válida por 24 horas por motivos de segurança.</em></p>
                <p>Se você não solicitou esta senha, ignore este email.</p>
              </div>
              <div class="footer">
                <p>© 2024 DEJEM - 9º Grupamento de Bombeiros</p>
              </div>
            </div>
          </body>
          </html>
        `
      })
    });

    const data = await res.json();

    if (res.ok) {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true, data })
      };
    } else {
      return {
        statusCode: res.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: data.message || 'Erro ao enviar email' })
      };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};