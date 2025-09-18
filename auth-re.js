import { 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

// Variável global para armazenar dados do usuário
let usuarioAtual = null;
let reAtual = null;

// Verifica RE quando o campo perde o foco
document.getElementById('re').addEventListener('blur', async (e) => {
    await verificarRE(e.target.value);
});

// Também verifica quando o usuário digita Enter no campo RE
document.getElementById('re').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        await verificarRE(e.target.value);
    }
});

// Função para verificar o RE e buscar dados
async function verificarRE(re) {
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loadingRE = document.getElementById('loadingRE');
    const userInfo = document.getElementById('userInfo');
    const loginBtn = document.getElementById('loginBtn');
    const loginFields = document.getElementById('loginFields');
    const redefinirSenhaBtn = document.getElementById('redefinirSenhaBtn');
    
    errorMessage.textContent = '';
    successMessage.textContent = '';
    reAtual = re;
    
    if (!re || re.length < 3) {
        userInfo.style.display = 'none';
        loginFields.style.display = 'none';
        redefinirSenhaBtn.style.display = 'none';
        loginBtn.disabled = true;
        return;
    }
    
    loadingRE.style.display = 'block';
    userInfo.style.display = 'none';
    loginFields.style.display = 'none';
    redefinirSenhaBtn.style.display = 'none';
    loginBtn.disabled = true;
    
    try {
        // Busca o usuário pelo RE
        const reSnapshot = await get(ref(database, `acesso/${re}`));
        
        if (!reSnapshot.exists()) {
            errorMessage.textContent = 'RE não encontrado.';
            userInfo.style.display = 'none';
            loginFields.style.display = 'none';
            redefinirSenhaBtn.style.display = 'none';
            loginBtn.disabled = true;
            loadingRE.style.display = 'none';
            return;
        }
        
        usuarioAtual = reSnapshot.val();
        
        // Preenche os dados na tela
        document.getElementById('userNamePreview').textContent = usuarioAtual.nome;
        document.getElementById('userEmailPreview').textContent = usuarioAtual.email;
        document.getElementById('userStatusPreview').textContent = 
            usuarioAtual.redefinirSenha ? 'Primeiro Acesso' : 'Usuário Ativo';
        
        // Mostra os campos apropriados
        userInfo.style.display = 'block';
        
        if (usuarioAtual.redefinirSenha) {
            redefinirSenhaBtn.style.display = 'block';
            loginFields.style.display = 'none';
        } else {
            loginFields.style.display = 'block';
            redefinirSenhaBtn.style.display = 'none';
            loginBtn.disabled = false;
        }
        
        if (usuarioAtual.redefinirSenha) {
            redefinirSenhaBtn.focus();
        } else {
            document.getElementById('password').focus();
        }
        
    } catch (error) {
        errorMessage.textContent = 'Erro ao buscar dados do RE.';
        console.error('Erro:', error);
    } finally {
        loadingRE.style.display = 'none';
    }
}

// Botão de Primeiro Acesso
document.getElementById('redefinirSenhaBtn').addEventListener('click', async () => {
    if (usuarioAtual && usuarioAtual.redefinirSenha) {
        window.location.href = `redefinir-senha.html?re=${reAtual}`;
    }
});

// Login normal
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loading = document.getElementById('loading');
    
    errorMessage.textContent = '';
    successMessage.textContent = '';
    loading.style.display = 'block';
    
    try {
        if (!usuarioAtual || !reAtual) {
            errorMessage.textContent = 'Por favor, verifique seu RE primeiro.';
            loading.style.display = 'none';
            return;
        }
        
        const userCredential = await signInWithEmailAndPassword(auth, usuarioAtual.email, password);
        const user = userCredential.user;
        
        const userSnapshot = await get(ref(database, `acesso/${reAtual}`));
        
        if (userSnapshot.exists() && userSnapshot.val().redefinirSenha) {
            window.location.href = `redefinir-senha.html?re=${reAtual}`;
        } else {
            window.location.href = 'main.html';
        }
        
    } catch (error) {
        loading.style.display = 'none';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage.textContent = 'Usuário não encontrado.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage.textContent = 'Senha incorreta.';
            
            if (confirm('Senha incorreta. Deseja receber uma senha temporária por e-mail?')) {
                // USA A FUNÇÃO DO FIREBASE DIRETO (já que seu backend não está pronto)
                await sendPasswordResetEmail(auth, usuarioAtual.email);
                successMessage.textContent = 'E-mail de redefinição enviado!';
            }
        } else {
            errorMessage.textContent = 'Erro ao fazer login. Tente novamente.';
        }
    }
});

// Função para enviar senha temporária PERSONALIZADA
async function enviarSenhaTemporaria(re) {
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    loading.style.display = 'block';
    errorMessage.textContent = '';
    successMessage.textContent = '';
    
    try {
        console.log('🔍 Buscando RE:', re);
        
        // 1. Busca o usuário pelo RE
        const reSnapshot = await get(ref(database, `acesso/${re}`));
        
        if (!reSnapshot.exists()) {
            errorMessage.textContent = 'RE não encontrado.';
            loading.style.display = 'none';
            return;
        }
        
        const userData = reSnapshot.val();
        console.log('📧 Email encontrado:', userData.email);
        
        // 2. USA O MÉTODO NATIVO DO FIREBASE (funciona sempre)
        await sendPasswordResetEmail(auth, userData.email);
        
        successMessage.textContent = 'E-mail de redefinição enviado! Verifique sua caixa de entrada.';
        console.log('✅ Email do Firebase enviado');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        errorMessage.textContent = 'Erro ao enviar e-mail. Tente novamente.';
    } finally {
        loading.style.display = 'none';
    }
}

// Função para gerar senha temporária
function gerarSenhaTemporaria() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let senha = '';
    
    // Garante que tenha pelo menos 1 letra maiúscula, 1 minúscula e 1 número
    senha += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 26));
    senha += 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26));
    senha += '0123456789'.charAt(Math.floor(Math.random() * 10));
    
    // Completa os 5 caracteres restantes
    for (let i = 0; i < 5; i++) {
        senha += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    
    // Embaralha a senha
    senha = senha.split('').sort(() => Math.random() - 0.5).join('');
    
    return senha + '!'; // Exemplo: "Ab3cdeF!"
}

// Esqueci minha senha
document.getElementById('forgotPassword').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const re = document.getElementById('re').value;
    const errorMessage = document.getElementById('errorMessage');
    
    if (!re) {
        errorMessage.textContent = 'Digite seu RE primeiro.';
        return;
    }
    
    await enviarSenhaTemporaria(re);
});

// Verifica se usuário já está logado
auth.onAuthStateChanged(async (user) => {
    if (user) {
        window.location.href = 'main.html';
    }
});

// Função para atualizar senha no backend
async function atualizarSenhaNoBackend(email, novaSenha) {
    try {
        const response = await fetch('/api/atualizar-senha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, novaSenha })
        });
        return await response.json();
    } catch (error) {
        console.error('Erro ao atualizar senha:', error);
        throw error;
    }
}

// Função para enviar email personalizado
async function enviarEmailSenhaTemporaria(email, senhaTemporaria, nome) {
    try {
        const response = await fetch('/.netlify/functions/enviar-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senhaTemporaria, nome })
        });
        return await response.json();
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        throw error;
    }
}