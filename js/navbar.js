// js/navbar.js - VERSÃO COM DROPDOWN UNIFICADO
import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

console.log('✅ navbar.js carregado');

// 1. FUNÇÃO QUE ATUALIZA O DROPDOWN COM NOME DO USUÁRIO
function updateUserGreeting() {
    const greeting = document.getElementById('userGreeting');
    const dropdownToggle = document.getElementById('userGreetingDropdown');
    
    if (!greeting || !dropdownToggle) {
        console.log('⏳ Aguardando elementos do dropdown...');
        setTimeout(updateUserGreeting, 100);
        return;
    }
    
    // Buscar dados DIRETAMENTE do sessionStorage
    const userName = sessionStorage.getItem('userName');
    const userRE = sessionStorage.getItem('userRE');
    
    console.log('📦 Dados encontrados:', { userName, userRE });
    
    // Se tem dados, atualiza
    if (userName) {
        // Limpar nome (remover ..., RE, etc)
        let cleanName = userName;
        cleanName = cleanName.replace(/\.{3,}/g, '');
        cleanName = cleanName.replace(/\s*\(.*\)/g, '');
        cleanName = cleanName.trim();
        
        // Atualizar o texto dentro do botão dropdown
        greeting.textContent = cleanName;
        
        // Adicionar tooltip opcional com RE
        if (userRE) {
            dropdownToggle.title = `RE: ${userRE}`;
            dropdownToggle.setAttribute('data-bs-toggle', 'tooltip');
            dropdownToggle.setAttribute('data-bs-placement', 'bottom');
        }
        
        console.log('✅ Dropdown atualizado:', cleanName);
        return true;
    }
    
    // Se não tem dados, mostra "Carregando..."
    greeting.textContent = 'Carregando...';
    return false;
}

// 2. Função de logout
async function performLogout() {
    try {
        if (auth) {
            await signOut(auth);
        }
        
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Erro no logout:', error);
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

// 3. Configurar dropdown
function setupDropdown() {
    // Logout
    const logoutBtn = document.getElementById('navLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const originalText = logoutBtn.innerHTML;
            logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saindo...';
            
            await performLogout();
            
            // Restaurar texto original (em caso de erro)
            setTimeout(() => {
                logoutBtn.innerHTML = originalText;
            }, 3000);
        });
    }
    
    // Perfil
    const profileBtn = document.getElementById('navProfile');
    if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'perfil.html';
        });
    }
    
    // Links "#" do dropdown de módulos
    document.querySelectorAll('.dropdown-item[href="#"]').forEach(link => {
        link.addEventListener('click', (e) => e.preventDefault());
    });
}

// 4. Destacar menu ativo
function highlightMenu() {
    const page = location.pathname.split('/').pop();
    
    // Remover classe "active" de todos os links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        link.style.pointerEvents = 'auto';
        link.style.opacity = '1';
        link.style.color = 'rgba(255, 255, 255, 0.8)';
    });
    
    // Adicionar "active" apenas ao link correto
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === page) {
            link.classList.add('active');
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.9';
            link.style.color = '#fff';
        }
    });
    
    // Garantir que navbar-brand não tenha link
    const navbarBrand = document.querySelector('.navbar-brand');
    if (navbarBrand) {
        navbarBrand.classList.remove('active');
        navbarBrand.style.cursor = 'default';
        navbarBrand.style.opacity = '1';
        navbarBrand.style.color = '#fff';
    }
}

// 5. Configurar navegação SPA
function setupSPANavigation() {
    // Interceptar cliques nos links do navbar
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link[href$=".html"]');
        if (link && !link.hasAttribute('data-ignore-spa')) {
            e.preventDefault();
            const href = link.getAttribute('href');
            
            // Se estiver no SPA, usar window.app.loadPage
            if (window.app && window.app.loadPage) {
                window.app.loadPage(href);
            } else {
                // Fallback: navegação normal
                window.location.href = href;
            }
        }
    });
}

// 6. Estilizar o dropdown toggle
function styleDropdownToggle() {
    const dropdownToggle = document.getElementById('userGreetingDropdown');
    if (!dropdownToggle) return;
    
    // Estilos para o botão dropdown
    dropdownToggle.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    dropdownToggle.style.color = '#fff';
    dropdownToggle.style.transition = 'all 0.2s';
    
    // Estilo no hover
    dropdownToggle.addEventListener('mouseenter', () => {
        dropdownToggle.style.borderColor = '#fff';
        dropdownToggle.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    dropdownToggle.addEventListener('mouseleave', () => {
        dropdownToggle.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        dropdownToggle.style.backgroundColor = 'transparent';
    });
    
    // Estilo quando aberto
    dropdownToggle.addEventListener('click', () => {
        setTimeout(() => {
            const isOpen = dropdownToggle.getAttribute('aria-expanded') === 'true';
            if (isOpen) {
                dropdownToggle.style.borderColor = '#fff';
                dropdownToggle.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            } else {
                dropdownToggle.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                dropdownToggle.style.backgroundColor = 'transparent';
            }
        }, 10);
    });
}

// 7. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏁 Navbar inicializando...');
    
    // Atualizar dropdown com nome IMEDIATAMENTE
    updateUserGreeting();
    
    // Tentar novamente após 500ms
    setTimeout(updateUserGreeting, 500);
    
    // Tentar novamente após 1s
    setTimeout(updateUserGreeting, 1000);
    
    // Configurar o resto
    setupDropdown();
    highlightMenu();
    setupSPANavigation();
    styleDropdownToggle();
    
    // Inicializar tooltips do Bootstrap
    if (typeof bootstrap !== 'undefined') {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
    
    console.log('✅ Navbar inicializado');
});

// 8. Função global para forçar atualização
window.updateNavbarUserGreeting = updateUserGreeting;

// 9. Função para atualizar menu ativo quando SPA carrega página
window.updateNavbarActiveMenu = function(pageUrl) {
    // Remover active de todos
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        link.style.pointerEvents = 'auto';
        link.style.opacity = '1';
        link.style.color = 'rgba(255, 255, 255, 0.8)';
    });
    
    // Adicionar active ao correto
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageUrl) {
            link.classList.add('active');
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.9';
            link.style.color = '#fff';
        }
    });
};

// 10. Exportar funções
export { updateUserGreeting };