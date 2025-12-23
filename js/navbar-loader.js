// Módulo para carregar o navbar dinamicamente
import { navbarFunctions } from '../components/navbar.js';

// Configurações globais
const NAVBAR_PATH = 'components/navbar.html';

// Carregar navbar em um elemento específico
export async function loadNavbar(targetElementId = 'navbar') {
    try {
        console.log(`📂 Carregando navbar em #${targetElementId}...`);
        
        // 1. Buscar o HTML do navbar
        const response = await fetch(NAVBAR_PATH);
        if (!response.ok) {
            throw new Error(`Erro ao carregar navbar: ${response.status}`);
        }
        
        const html = await response.text();
        
        // 2. Inserir no DOM
        const targetElement = document.getElementById(targetElementId);
        if (!targetElement) {
            throw new Error(`Elemento #${targetElementId} não encontrado`);
        }
        
        targetElement.innerHTML = html;
        console.log('✅ Navbar carregado com sucesso');
        
        // 3. O navbar.js será executado automaticamente via script tag
        // Aguardar um momento para garantir que foi carregado
        return new Promise((resolve) => {
            setTimeout(() => {
                // Verificar se as funções estão disponíveis
                if (window.navbarFunctions) {
                    console.log('✅ Funções do navbar disponíveis');
                    resolve(window.navbarFunctions);
                } else {
                    console.warn('⚠️ Funções do navbar não disponíveis, usando fallback');
                    resolve(null);
                }
            }, 300);
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar navbar:', error);
        
        // Fallback básico
        const targetElement = document.getElementById(targetElementId);
        if (targetElement) {
            targetElement.innerHTML = createFallbackNavbar();
        }
        
        return null;
    }
}

// Navbar de fallback (caso o arquivo principal falhe)
function createFallbackNavbar() {
    return `
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
}

// Atualizar timer do navbar (para ser chamado pelo auth-check.js)
export function updateNavbarTimer(timeRemaining) {
    if (window.navbarFunctions && window.navbarFunctions.updateTimer) {
        window.navbarFunctions.updateTimer(timeRemaining);
    } else {
        console.warn('⚠️ Função updateTimer não disponível');
    }
}

// Forçar logout via navbar
export function performNavbarLogout() {
    if (window.navbarFunctions && window.navbarFunctions.performLogout) {
        return window.navbarFunctions.performLogout();
    } else {
        console.warn('⚠️ Usando logout fallback');
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';
        return Promise.resolve();
    }
}