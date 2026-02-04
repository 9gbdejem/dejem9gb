import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { database } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Verificar autenticação e nível de acesso
export function checkAuth(requiredLevel = 1) {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                console.log('❌ Usuário não autenticado');
                window.location.href = 'index.html';
                return;
            }

            try {
                // 1. PEGAR O RE DO STORAGE
                let userRE = sessionStorage.getItem('userRE');
                if (!userRE) userRE = localStorage.getItem('userRE');
                
                if (!userRE) {
                    throw new Error('RE não encontrado');
                }

                // 2. BUSCAR DADOS DO USUÁRIO
                const efetivoRef = ref(database, `efetivo/${userRE}`);
                const snapshot = await get(efetivoRef);

                if (!snapshot.exists()) {
                    throw new Error('Dados do usuário não encontrados');
                }

                const userData = snapshot.val();
                const userLevel = userData.nivel || 3;
                
                if (userLevel <= requiredLevel) {
                    resolve({ 
                        user, 
                        userData,
                        re: userRE
                    });
                } else {
                    // ✅ CORRIGIDO: Mostra msgbox e redireciona CORRETAMENTE
                    console.log(`🚫 Nível insuficiente: usuário ${userLevel}, necessário ${requiredLevel}`);
                    
                    // SALVAR O NÍVEL ATUAL ANTES DO ALERT (para navbar carregar certo)
                    sessionStorage.setItem('currentUserLevel', userLevel);
                    
                    // Msgbox
                    alert(`🚫 Acesso Negado!\n\nCaso necessário, contate o B/3.`);
                    
                    // ✅ CORRIGIDO: Redirecionar como se fosse um clique normal
                    // Isso evita problemas com SPA/recarregamentos
                    if (window.location.pathname.includes('app.html')) {
                        // Se estiver no SPA, navega via SPA
                        if (window.app && window.app.loadPage) {
                            window.app.loadPage('app.html');
                        } else {
                            window.location.href = 'app.html';
                        }
                    } else {
                        // Se for página independente, redireciona normal
                        window.location.href = 'app.html';
                    }
                    
                    // Rejeita a promise para interromper a execução
                    reject(new Error(`Nível insuficiente: ${userLevel} < ${requiredLevel}`));
                }

            } catch (error) {
                console.error('💥 Erro ao verificar acesso:', error.message);
                
                // Se não for erro de nível, faz logout normalmente
                if (!error.message.includes('Nível insuficiente')) {
                    alert('Erro ao verificar permissões.');
                    clearUserData();
                    window.location.href = 'index.html';
                }
                reject(error);
            }
        });
    });
}

// Limpar dados do usuário
function clearUserData() {
    sessionStorage.removeItem('userRE');
    sessionStorage.removeItem('userName');
    localStorage.removeItem('userRE');
    localStorage.removeItem('userName');
}

export async function loadNavbar() {
    // console.log('🔄 Iniciando loadNavbar()...');
    
    // ✅ CORRIGIDO: Verificar se navbar já foi carregada
    const existingNavbar = document.getElementById('navbar');
    if (existingNavbar && existingNavbar.innerHTML.trim() !== '') {
        console.log('✅ Navbar já carregada, ignorando nova carga');
        return true;
    }
    
    // Verificar se o elemento existe
    let navbarElement = document.getElementById('navbar');
    if (!navbarElement) {
        console.error('❌ Elemento #navbar não encontrado, criando...');
        navbarElement = document.createElement('div');
        navbarElement.id = 'navbar';
        document.body.insertBefore(navbarElement, document.body.firstChild);
    }
    
    try {
        // Tentar carregar o navbar
        const response = await fetch('components/navbar.html');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // ✅ CORRIGIDO: Inserir SEMPRE, mas verificar se já tem conteúdo
        if (navbarElement.innerHTML.trim() === '') {
            navbarElement.innerHTML = html;
            // console.log('✅ Navbar carregada no DOM');
        } else {
            // console.log('✅ Navbar já tinha conteúdo, mantendo');
        }
        
        // ✅ CORRIGIDO: Ocultar itens por nível DEPOIS de garantir que navbar carregou
        setTimeout(() => {
            // Aguardar um pouco mais para garantir que todos os elementos estão no DOM
            setTimeout(hideNavbarItemsByLevel, 200);
        }, 100);
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao carregar navbar:', error.message);
        
        // Fallback básico APENAS se não tiver conteúdo
        if (!navbarElement.innerHTML.trim()) {
            navbarElement.innerHTML = createFallbackNavbar();
            console.log('✅ Navbar fallback criado');
        }
        
        return false;
    }
}

// ✅ CORRIGIDO: Função melhorada para ocultar itens
async function hideNavbarItemsByLevel() {
    try {
        // Pegar nível do usuário (de sessionStorage primeiro)
        let userLevel = sessionStorage.getItem('currentUserLevel');
        
        // Se não tiver no session, buscar do Firebase
        if (!userLevel) {
            let userRE = sessionStorage.getItem('userRE');
            if (!userRE) return;
            
            const efetivoRef = ref(database, `efetivo/${userRE}`);
            const snapshot = await get(efetivoRef);
            
            if (!snapshot.exists()) return;
            
            const userData = snapshot.val();
            userLevel = userData.nivel || 3;
            sessionStorage.setItem('currentUserLevel', userLevel);
        }
        
        // console.log(`🎯 Ajustando navbar para nível ${userLevel}...`);
        
        // Aguardar um pouco mais para garantir que elementos foram renderizados
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Nível 3 (usuário normal) - só vê Dashboard e Escalas
        if (parseInt(userLevel) >= 3) {
            hideElement('#navExclusoes');
            // ✅ ADICIONAR ESTA LINHA: Ocultar Solicitações também
            hideElement('#navSolicitacoes');
        }
        
        // Nível 2 e 1 - vê tudo
        
    } catch (error) {
        console.error('❌ Erro ao ajustar navbar:', error);
        // Tentar novamente depois de 1 segundo
        setTimeout(hideNavbarItemsByLevel, 1000);
    }
}

// ✅ CORRIGIDO: Função melhorada para ocultar elemento
function hideElement(selector, retryCount = 0) {
    const element = document.querySelector(selector);
    if (element) {
        // Encontra o li pai e oculta
        const parentLi = element.closest('li.nav-item');
        if (parentLi) {
            parentLi.style.display = 'none';
            // console.log(`👁️ Ocultando menu: ${selector}`);
            return true;
        }
    }
    
    // Se não encontrou, tenta novamente (máx 3 tentativas)
    if (retryCount < 3) {
        setTimeout(() => hideElement(selector, retryCount + 1), 500);
    }
    
    return false;
}

// Navbar de fallback
function createFallbackNavbar() {
    return `
        <nav class="navbar navbar-dark bg-primary">
            <div class="container-fluid">
                <a class="navbar-brand" href="dashboard.html">Sistema</a>
                <div>
                    <a href="dashboard.html" class="btn btn-outline-light btn-sm me-2">
                        Dashboard
                    </a>
                    <a href="escalas.html" class="btn btn-outline-light btn-sm me-2">
                        Escalas
                    </a>
                    <button class="btn btn-outline-light btn-sm" 
                            onclick="sessionStorage.clear(); window.location.href='index.html'">
                        Sair
                    </button>
                </div>
            </div>
        </nav>
    `;
}

// Atualizar timer no navbar
function updateTimerInNavbar(timeRemaining) {
    if (window.navbarFunctions && window.navbarFunctions.updateTimer) {
        window.navbarFunctions.updateTimer(timeRemaining);
    } else {
        // Fallback: atualizar depois de 1 segundo
        setTimeout(() => {
            if (window.navbarFunctions && window.navbarFunctions.updateTimer) {
                window.navbarFunctions.updateTimer(timeRemaining);
            }
        }, 1000);
    }
}

// Carregar informações do usuário no navbar
function loadUserInfoInNavbar() {
    if (window.navbarFunctions && window.navbarFunctions.loadUserInfo) {
        window.navbarFunctions.loadUserInfo();
    }
}

// Modifique a função updateSessionTimer para integrar com navbar
export function updateSessionTimer() {
    const expiryTime = parseInt(sessionStorage.getItem('sessionExpiryTime'));
    if (!expiryTime) return;
    
    const currentTime = Date.now();
    const timeRemaining = Math.max(0, expiryTime - currentTime);
    
    // Usar o novo sistema de timer
    updateNavbarTimer(timeRemaining);
    
    if (timeRemaining <= 0) {
        console.log('⏰ Sessão expirada, fazendo logout...');
        performNavbarLogout();
    }
}

// ✅ NOVA FUNÇÃO: Verificar e mostrar mensagem de acesso negado
export function checkAccessDeniedMessage() {
    const deniedMessage = sessionStorage.getItem('accessDeniedMessage');
    if (deniedMessage) {
        // Mostrar alerta
        alert(deniedMessage);
        
        // Remover mensagem
        sessionStorage.removeItem('accessDeniedMessage');
        
        return true;
    }
    return false;
}

// ✅ NOVA FUNÇÃO: Navegação segura para dashboard
export function safeRedirectToDashboard() {
    console.log('🔄 Redirecionando seguramente para dashboard...');
    
    // Limpar qualquer estado de erro
    sessionStorage.removeItem('accessDeniedMessage');
    
    if (window.location.pathname.includes('app.html')) {
        // Se estiver no SPA
        if (window.app && typeof window.app.loadPage === 'function') {
            console.log('📍 Navegando via SPA para dashboard');
            window.app.loadPage('dashboard.html');
        } else {
            // Fallback para navegação normal
            console.log('📍 Navegando normalmente para dashboard (fallback)');
            window.location.href = 'dashboard.html';
        }
    } else {
        // Páginas independentes
        console.log('📍 Navegando para dashboard (página independente)');
        window.location.href = 'dashboard.html';
    }
}