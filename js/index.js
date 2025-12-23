import { database, auth } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

async function getUserEmailFromRE(re) {
    try {
        // Em produção, você precisaria de um Cloud Function ou outra solução
        // para buscar o email de forma segura sem expor todo o nó efetivo
        
        // SOLUÇÃO TEMPORÁRIA: Padrão de email
        // Se todos os emails seguem: RE@empresa.com
        return `${re}@empresa.com`;
        
        // OU se você tiver um backend/cloud function:
        // const response = await fetch(`/api/get-email/${re}`);
        // const data = await response.json();
        // return data.email;
        
    } catch (error) {
        console.error('Erro ao buscar email:', error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Elementos DOM
    const reInput = document.getElementById('reInput');
    const searchReBtn = document.getElementById('searchReBtn');
    const passwordStep = document.getElementById('passwordStep');
    const reStep = document.getElementById('reStep');
    const userName = document.getElementById('userName');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const backBtn = document.getElementById('backBtn');
    const togglePassword = document.getElementById('togglePassword');
    const forgotPassword = document.getElementById('forgotPassword');
    const errorAlert = document.getElementById('errorAlert');
    const infoAlert = document.getElementById('infoAlert');

    let userRE = '';  // Vamos armazenar o RE
    let userEmail = '';
    let userFullName = '';

    // Máscara para RE (apenas números, máximo 6 dígitos)
    reInput.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });

    // Buscar RE
    searchReBtn.addEventListener('click', async function() {
        const re = reInput.value.trim();
        userRE = re;
        
        // console.log('🔍 Buscando RE:', re); // DEBUG 1
        
        if (re.length !== 6) {
            showError('Por favor, digite um RE válido de 6 dígitos.');
            return;
        }

        searchReBtn.disabled = true;
        searchReBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Buscando...';

        try {
            // Buscar no nó "login"
            const loginRef = ref(database, `login/${re}`);
            // console.log('📡 Buscando no caminho:', `login/${re}`); // DEBUG 2
            
            const snapshot = await get(loginRef);
            // console.log('📦 Resultado da busca:', snapshot.exists() ? snapshot.val() : 'NÃO ENCONTRADO'); // DEBUG 3

            if (snapshot.exists()) {
                const userData = snapshot.val();
                userEmail = userData.email;  // ou userData["e-mail"] conforme sua estrutura
                userFullName = userData.nome;
                
                // DEBUG 4 - Mostra o que foi encontrado
                // console.log('✅ Dados encontrados:', {
                //     email: userEmail,
                //     nome: userFullName,
                //     dadosCompletos: userData
                // });

                // Verifica se o email foi encontrado
                if (!userEmail) {
                    console.error('❌ Email NÃO encontrado nos dados:', userData);
                    showError('Email não configurado para este RE.');
                    return;
                }
                
                // MOSTRAR o link "Esqueci minha senha"
                forgotPassword.classList.remove('d-none');
                
                userName.textContent = userFullName;
                reStep.classList.remove('active');
                passwordStep.classList.add('active');
                
                setTimeout(() => passwordInput.focus(), 300);
            } else {
                // console.error('❌ RE não encontrado no banco de dados');
                showError('RE não encontrado. Verifique o número digitado.');
            }
        } catch (error) {
            // console.error('💥 Erro ao buscar RE:', error);
            showError('Erro ao buscar usuário. Tente novamente.');
        } finally {
            searchReBtn.disabled = false;
            searchReBtn.innerHTML = '<i class="fas fa-search me-2"></i>Verificar RE';
        }
    });

    // Voltar para o passo do RE
    backBtn.addEventListener('click', function() {
        passwordStep.classList.remove('active');
        reStep.classList.add('active');
        passwordInput.value = '';
        reInput.focus();
        
        // ESCONDER o link "Esqueci minha senha" ao voltar
        forgotPassword.classList.add('d-none');
        
        // Limpar variáveis
        userRE = '';
        userEmail = '';
        userFullName = '';
    });


    // Mostrar/ocultar senha
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    // Login
    loginBtn.addEventListener('click', async function() {
        const password = passwordInput.value.trim();
        
        // DEBUG 5 - Mostra o que será enviado para login
        // console.log('🔐 Tentando login com:', {
        //     email: userEmail,
        //     re: userRE,
        //     passwordLength: password.length
        // });
        
        if (!password) {
            showError('Por favor, digite sua senha.');
            return;
        }

        if (!userEmail) {
            console.error('❌ Email não definido para login');
            showError('Erro interno: email não encontrado.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Entrando...';

        try {
            // console.log('📤 Enviando para Firebase Auth:', userEmail); // DEBUG 6
            
            const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
            
            sessionStorage.setItem('userRE', userRE);
            sessionStorage.setItem('userName', userFullName);

            window.location.href = 'dashboard.html';
            
        } catch (error) {
            // DEBUG 8 - Mostra erro detalhado
            // console.error('💥 Erro completo do Firebase:', {
            //     code: error.code,
            //     message: error.message,
            //     emailUsado: userEmail,
            //     stack: error.stack
            // });
            
            let errorMessage = 'Erro ao fazer login. ';
            
            switch (error.code) {
                case 'auth/invalid-credential':
                case 'auth/wrong-password':
                case 'auth/invalid-login-credentials':
                    errorMessage += 'Senha incorreta.';
                    break;
                case 'auth/user-not-found':
                    errorMessage += `Nenhuma conta encontrada para o email: ${userEmail}`;
                    break;
                case 'auth/invalid-email':
                    errorMessage += `Email inválido: ${userEmail}`;
                    break;
                case 'auth/too-many-requests':
                    errorMessage += 'Muitas tentativas. Tente novamente mais tarde.';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            showError(errorMessage);
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Entrar';
        }
    });

    // Recuperação de senha
    forgotPassword.addEventListener('click', async function(e) {
        e.preventDefault();
        
        if (!userEmail) {
            showInfo('Por favor, verifique seu RE primeiro para habilitar a recuperação.');
            return;
        }
        
        console.log('📧 Iniciando recuperação para:', userEmail); // DEBUG
        
        try {
            await sendPasswordResetEmail(auth, userEmail);
            showInfo(`E-mail de recuperação enviado para: ${userEmail}`);
            console.log('✅ E-mail de recuperação enviado');
        } catch (error) {
            console.error('💥 Erro ao enviar e-mail de recuperação:', error);
            showError('Erro ao enviar e-mail de recuperação: ' + error.message);
        }
    });

    // Permitir pressionar Enter
    reInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchReBtn.click();
        }
    });

    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });

    // Funções auxiliares
    function showError(message) {
        errorAlert.textContent = message;
        errorAlert.classList.remove('d-none');
        infoAlert.classList.add('d-none');
        setTimeout(() => errorAlert.classList.add('d-none'), 5000);
    }

    function showInfo(message) {
        infoAlert.textContent = message;
        infoAlert.classList.remove('d-none');
        errorAlert.classList.add('d-none');
        setTimeout(() => infoAlert.classList.add('d-none'), 5000);
    }
});