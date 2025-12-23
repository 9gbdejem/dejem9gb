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

            console.log('✅ Usuário autenticado:', user.email);

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
                    console.error('❌ Nível de acesso insuficiente');
                    alert('Acesso negado. Permissões insuficientes.');
                    await auth.signOut();
                    clearUserData();
                    window.location.href = 'dashboard.html';
                }

            } catch (error) {
                console.error('💥 Erro ao verificar acesso:', error.message);
                alert('Erro ao verificar permissões.');
                clearUserData();
                window.location.href = 'index.html';
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
    console.log('🔄 Iniciando loadNavbar()...');
    
    // Verificar se o elemento existe
    let navbarElement = document.getElementById('navbar');
    if (!navbarElement) {
        console.error('❌ Elemento #navbar não encontrado, criando...');
        navbarElement = document.createElement('div');
        navbarElement.id = 'navbar';
        document.body.insertBefore(navbarElement, document.body.firstChild);
    }
    
    try {
        console.log('📤 Buscando navbar.html...');
        
        // Tentar carregar o navbar
        const response = await fetch('components/navbar.html');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log(`✅ navbar.html carregado (${html.length} caracteres)`);
        
        // Inserir no DOM
        navbarElement.innerHTML = html;
        console.log('✅ Navbar inserido no DOM');
        
        // O navbar.js será carregado automaticamente pelo script tag
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao carregar navbar:', error.message);
        
        // Fallback básico
        navbarElement.innerHTML = `
            <nav class="navbar navbar-dark bg-primary">
                <div class="container-fluid">
                    <a class="navbar-brand" href="dashboard.html">
                        <i class="fas fa-shield-alt me-2"></i>Sistema
                    </a>
                    <div class="d-flex">
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
        
        console.log('✅ Navbar fallback criado');
        return false;
    }
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