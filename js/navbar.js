// js/navbar.js - JavaScript do Navbar SEM tempo de sessão
import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

console.log('✅ navbar.js carregado');

// Função para destacar item ativo no menu
function highlightActiveMenu() {
    const currentPage = window.location.pathname.split('/').pop();
    console.log('📌 Página atual:', currentPage);
    
    // Remover ativo de todos
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
    });
    
    // Adicionar ativo ao item correto
    let activeLink;
    switch(currentPage) {
        case 'dashboard.html':
            activeLink = document.getElementById('navDashboard');
            break;
        case 'escalas.html':
            activeLink = document.getElementById('navEscalas');
            break;
        default:
            // Se for index.html ou outra página, não destacar nada
            console.log('ℹ️  Página não mapeada:', currentPage);
            return;
    }
    
    if (activeLink) {
        activeLink.classList.add('active');
        activeLink.setAttribute('aria-current', 'page');
        console.log('🎯 Menu ativo destacado:', activeLink.textContent.trim());
    }
}

// Carregar informações do usuário
function loadUserInfo() {
    const userName = sessionStorage.getItem('userName') || localStorage.getItem('userName');
    const userRE = sessionStorage.getItem('userRE') || localStorage.getItem('userRE');
    
    const userNameElement = document.getElementById('userNameNav');
    const greetingElement = document.getElementById('userGreeting');
    
    if (userName && userNameElement) {
        userNameElement.textContent = userName;
        console.log('👤 Nome do usuário carregado:', userName);
    }
    
    if (greetingElement && userName && userRE) {
        greetingElement.innerHTML = `
            <i class="fas fa-user-circle me-1"></i>
            <span id="userNameNav">${userName}</span>
            <small class="text-muted ms-1">(${userRE})</small>
        `;
        console.log('👤 RE do usuário carregado:', userRE);
    }
}

// Função de logout
async function performLogout() {
    try {
        console.log('🚪 Iniciando logout...');
        
        // 1. Fazer logout do Firebase
        if (auth) {
            await signOut(auth);
            console.log('✅ Firebase logout realizado');
        }
        
        // 2. Limpar todos os dados de sessão
        sessionStorage.clear();
        
        // 3. Limpar dados específicos do localStorage
        const itemsToRemove = ['userRE', 'userName'];
        itemsToRemove.forEach(item => localStorage.removeItem(item));
        
        console.log('🧹 Storage limpo');
        
        // 4. Redirecionar para login
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('❌ Erro no logout:', error);
        
        // Forçar limpeza e redirecionamento mesmo com erro
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

// Configurar eventos quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Navbar - DOM carregado, configurando eventos...');
    
    // 1. Destacar menu ativo
    highlightActiveMenu();
    
    // 2. Carregar informações do usuário
    loadUserInfo();
    
    // 3. Configurar eventos
    setupEventListeners();
});

// Configurar todos os event listeners
function setupEventListeners() {
    console.log('🔗 Configurando event listeners do navbar...');
    
    // Logout
    const logoutLink = document.getElementById('navLogout');
    if (logoutLink) {
        logoutLink.addEventListener('click', async function(e) {
            e.preventDefault();
            console.log('👤 Usuário clicou em sair');
            await performLogout();
        });
        console.log('✅ Listener de logout configurado');
    } else {
        console.error('❌ Elemento #navLogout não encontrado');
    }
    
    // Perfil
    const profileLink = document.getElementById('navProfile');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Página de perfil em desenvolvimento...');
        });
    }
    
    // Configurações
    const settingsLink = document.getElementById('navSettings');
    if (settingsLink) {
        settingsLink.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Configurações em desenvolvimento...');
        });
    }
    
    // Dropdown dos módulos - prevenir comportamento padrão para links #
    const dropdownLinks = document.querySelectorAll('.dropdown-item[href="#"]');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const text = this.textContent.trim();
            alert(`Módulo "${text}" em desenvolvimento...`);
        });
    });
    
    console.log('✅ Todos os event listeners configurados');
}

// Exportar funções para uso em outros módulos (se necessário)
export {
    highlightActiveMenu,
    loadUserInfo,
    performLogout
};