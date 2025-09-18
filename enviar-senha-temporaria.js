import { 
    sendPasswordResetEmail,
    updatePassword 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

// Função para gerar senha temporária
function gerarSenhaTemporaria() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let senha = '';
    for (let i = 0; i < 10; i++) {
        senha += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return senha;
}

// Função para enviar senha temporária por email (simulado)
async function enviarEmailSenhaTemporaria(email, senhaTemporaria, nome) {
    // Aqui você integraria com seu serviço de email
    console.log(`📧 Email enviado para: ${email}`);
    console.log(`🔑 Senha temporária: ${senhaTemporaria}`);
    
    // Simulação - na prática você usaria SendGrid, AWS SES, etc.
    alert(`SENHA TEMPORÁRIA ENVIADA!\nPara: ${email}\nSenha: ${senhaTemporaria}\n\n(Em produção, isso seria enviado por email)`);
    
    return true;
}

// Função principal para enviar senha temporária
export async function enviarSenhaTemporaria(re) {
    try {
        // 1. Busca usuário pelo RE
        const reSnapshot = await get(ref(database, `acesso/${re}`));
        
        if (!reSnapshot.exists()) {
            throw new Error('RE não encontrado');
        }
        
        const userData = reSnapshot.val();
        const email = userData.email;
        const uid = userData.uid;
        
        // 2. Gera senha temporária
        const senhaTemporaria = gerarSenhaTemporaria();
        
        // 3. Atualiza a senha no Firebase Auth
        // ⚠️ Nota: Isso requer Admin SDK ou que o usuário esteja logado
        // Para fazer via frontend, precisamos de uma Cloud Function
        
        // 4. Marca como primeiro acesso
        await update(ref(database, `acesso/${re}`), {
            senhaTemporaria: senhaTemporaria,
            senhaTemporariaTimestamp: new Date().toISOString(),
            redefinirSenha: true
        });
        
        // 5. Envia email com a senha temporária
        await enviarEmailSenhaTemporaria(email, senhaTemporaria, userData.nome);
        
        return { success: true, message: 'Senha temporária enviada' };
        
    } catch (error) {
        console.error('Erro ao enviar senha temporária:', error);
        return { success: false, message: error.message };
    }
}