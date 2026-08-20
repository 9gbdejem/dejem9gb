import { database, auth } from './firebase-config.js';
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

function primeiroValor(...valores) {
    return valores.find(valor => String(valor || '').trim() !== '') || '';
}

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
    let userLevel = 3;

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
                const efetivoSnapshot = await get(ref(database, `efetivo/${re}`));
                const userData = {
                    ...(efetivoSnapshot.exists() ? efetivoSnapshot.val() : {}),
                    ...snapshot.val()
                };
                userEmail = primeiroValor(userData.mail_funcional, userData.email, userData['e-mail']);
                userFullName = primeiroValor(userData.nome_completo, userData.nome, userData.name, re);
                userLevel = Number(userData.nivel || 3);
                
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
        userLevel = 3;
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
            
            // No index.js, no login bem-sucedido, ADICIONE:
            const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
            const authenticatedUser = userCredential.user;
            const now = new Date().toISOString();
            const nivel = userLevel;
            await update(ref(database, `login/${userRE}`), {
                uid: authenticatedUser.uid,
                re: userRE,
                mail_funcional: userEmail,
                nome_completo: userFullName,
                ultimo_login: now,
                atualizado_em: now
            });
            await set(ref(database, `usuariosPorUid/${authenticatedUser.uid}`), {
                re: userRE,
                nivel,
                mail_funcional: userEmail,
                nome_completo: userFullName,
                atualizado_em: now
            });

            // 1. SALVAR NO sessionStorage (funciona na mesma aba)
            sessionStorage.setItem('userRE', userRE);
            sessionStorage.setItem('userName', userFullName);
            sessionStorage.setItem('userNivel', String(nivel));
            sessionStorage.setItem('currentUserLevel', String(nivel));

            // 2. SALVAR NO localStorage (persiste entre abas)
            localStorage.setItem('userRE', userRE);
            localStorage.setItem('userName', userFullName);
            localStorage.setItem('userNivel', String(nivel));

            await new Promise(resolve => setTimeout(resolve, 100));

            // 3. DISPARAR EVENTO para atualizar outros componentes
            window.dispatchEvent(new CustomEvent('userLoggedIn', {
                detail: { userRE, userName: userFullName }
            }));

            console.log('💾 Dados do usuário salvos:');
            console.log('- sessionStorage:', sessionStorage.getItem('userRE'), sessionStorage.getItem('userName'));
            console.log('- localStorage:', localStorage.getItem('userRE'), localStorage.getItem('userName'));

            // Pequeno delay para garantir salvamento
            await new Promise(resolve => setTimeout(resolve, 100));

            window.location.href = 'app.html';
            
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
