// redefinir-senha.js
import { 
    signInWithEmailAndPassword,
    updatePassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    ref, 
    get, 
    update 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

let usuarioData = null;
let emailEnviado = false;

// Carrega dados do usuário baseado no RE da URL
async function carregarDadosUsuario() {
    const urlParams = new URLSearchParams(window.location.search);
    const re = urlParams.get('re');
    
    if (!re) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const userSnapshot = await get(ref(database, `acesso/${re}`));
        
        if (!userSnapshot.exists()) {
            alert('RE não encontrado.');
            window.location.href = 'index.html';
            return;
        }
        
        usuarioData = userSnapshot.val();
        usuarioData.re = re;
        
        // Preenche os dados na tela
        document.getElementById('re').value = re;
        document.getElementById('nome').textContent = usuarioData.nome;
        document.getElementById('emailCadastrado').textContent = usuarioData.email;
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do usuário.');
    }
}

// Verifica se o e-mail digitado confere
document.getElementById('verificarEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const emailConfirmacao = document.getElementById('emailConfirmacao').value;
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    
    if (emailConfirmacao !== usuarioData.email) {
        errorMessage.textContent = 'E-mail não confere com o cadastrado.';
        return;
    }
    
    loading.style.display = 'block';
    errorMessage.textContent = '';
    
    try {
        // Envia e-mail com senha temporária
        await sendPasswordResetEmail(auth, usuarioData.email);
        
        emailEnviado = true;
        document.getElementById('verificarEmailForm').style.display = 'none';
        document.getElementById('trocarSenhaForm').style.display = 'block';
        document.getElementById('successMessage').textContent = 'Senha temporária enviada para seu e-mail! Verifique sua caixa de entrada.';
        
    } catch (error) {
        errorMessage.textContent = 'Erro ao enviar e-mail. Tente novamente.';
    } finally {
        loading.style.display = 'none';
    }
});

// Troca a senha após receber a temporária
document.getElementById('trocarSenhaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const senhaTemporaria = document.getElementById('senhaTemporaria').value;
    const novaSenha = document.getElementById('novaSenha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    
    // Validações
    if (novaSenha !== confirmarSenha) {
        errorMessage.textContent = 'As senhas não coincidem.';
        return;
    }
    
    if (!validarSenhaForte(novaSenha)) {
        errorMessage.textContent = 'A senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial.';
        return;
    }
    
    loading.style.display = 'block';
    errorMessage.textContent = '';
    
    try {
        // 1. Faz login com a senha temporária
        const userCredential = await signInWithEmailAndPassword(auth, usuarioData.email, senhaTemporaria);
        const user = userCredential.user;
        
        // 2. Atualiza para a nova senha
        await updatePassword(user, novaSenha);
        
        // 3. Atualiza o database para marcar primeiro acesso como false
        const userFullSnapshot = await get(ref(database, `usuarios/${usuarioData.re}`));
        if (userFullSnapshot.exists()) {
            await update(ref(database, `usuarios/${usuarioData.re}`), {
                redefinirSenha: false,
                dataredefinirSenha: new Date().toISOString()
            });
            
            // Atualiza também no acesso
            await update(ref(database, `acesso/${usuarioData.re}`), {
                redefinirSenha: false
            });
        }
        
        document.getElementById('successMessage').textContent = 'Senha alterada com sucesso! Redirecionando para login...';
        
        // Desloga e redireciona
        setTimeout(async () => {
            await signOut(auth);
            window.location.href = 'index.html';
        }, 3000);
        
    } catch (error) {
        if (error.code === 'auth/invalid-login-credentials') {
            errorMessage.textContent = 'Senha temporária inválida ou expirada.';
        } else {
            errorMessage.textContent = 'Erro ao alterar senha. Tente novamente.';
        }
    } finally {
        loading.style.display = 'none';
    }
});

// Função para validar senha forte
function validarSenhaForte(senha) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(senha);
}

// Verificador de força de senha em tempo real
document.getElementById('novaSenha').addEventListener('input', function(e) {
    const senha = e.target.value;
    const strengthBar = document.querySelector('.strength-bar');
    const strengthText = document.querySelector('.strength-text');
    
    let strength = 0;
    if (senha.length >= 8) strength += 25;
    if (/[a-z]/.test(senha)) strength += 25;
    if (/[A-Z]/.test(senha)) strength += 25;
    if (/[\d@$!%*?&]/.test(senha)) strength += 25;
    
    strengthBar.style.width = strength + '%';
    
    if (strength < 50) {
        strengthBar.style.backgroundColor = '#e53e3e';
        strengthText.textContent = 'Fraca';
    } else if (strength < 75) {
        strengthBar.style.backgroundColor = '#d69e2e';
        strengthText.textContent = 'Média';
    } else {
        strengthBar.style.backgroundColor = '#38a169';
        strengthText.textContent = 'Forte';
    }
});

// Inicializa a página
document.addEventListener('DOMContentLoaded', carregarDadosUsuario);