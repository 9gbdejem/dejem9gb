import { checkAuth } from './auth-check.js';
import { loadNavbar } from './auth-check.js';

class AppCore {
    constructor() {
        // VERIFICAR ANTES DE TUDO: Só inicializa em app.html
        if (!window.location.pathname.includes('app.html')) {
            console.log(`🚫 ${window.location.pathname.split('/').pop()} - Não é SPA, ignorando app-core.js`);
            return null;
        }
        
        this.currentPage = 'dashboard';
    }
    
    async init() {
        if (!window.location.pathname.includes('app.html')) {
            console.log('📄 Página não-SPA - SPA não inicializado');
            return;
        }
        
        try {
            const { userData, re } = await checkAuth(3);
            
            sessionStorage.setItem('userRE', re);
            sessionStorage.setItem('userName', userData.nome);
            
            await loadNavbar();
            
            this.setupNavbar();
            await this.loadPage('dashboard.html');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar SPA:', error);
            this.showError(error);
        }
    }
    
    setupNavbar() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href$=".html"]');
            if (link && !link.hasAttribute('data-ignore-spa')) {
                e.preventDefault();
                const href = link.getAttribute('href');
                this.loadPage(href);
            }
        });
        
        this.setupUserGreeting();
        this.setupDropdown();
    }
    
    setupUserGreeting() {
        const updateGreeting = () => {
            const userName = sessionStorage.getItem('userName') || 'Usuário';
            const cleanName = userName.replace(/\.{3,}/g, '')
                                    .replace(/\s*\(.*\)/g, '')
                                    .trim();
            
            const greeting = document.getElementById('userGreeting');
            if (greeting) {
                const icon = greeting.querySelector('i');
                if (icon) icon.remove();
                
                greeting.innerHTML = `<span class="text-white">${cleanName}</span>`;
                greeting.style.whiteSpace = 'nowrap';
                greeting.style.overflow = 'visible';
                
                if (greeting.dataset.lastName !== cleanName) {
                    greeting.dataset.lastName = cleanName;
                }
            }
        };
        
        updateGreeting();
        window.updateUserGreetingInSPA = updateGreeting;
    }
    
    setupDropdown() {
        const logoutBtn = document.getElementById('navLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saindo...';
                
                try {
                    const { auth } = await import('./firebase-config.js');
                    const { signOut } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");
                    
                    await signOut(auth);
                    sessionStorage.clear();
                    localStorage.clear();
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error('Erro no logout:', error);
                    sessionStorage.clear();
                    localStorage.clear();
                    window.location.href = 'index.html';
                }
            });
        }
        
        const profileBtn = document.getElementById('navProfile');
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadPage('perfil.html');
            });
        }
    }
    
    getLoadingHTML(pageUrl) {
        const pageName = pageUrl.replace('.html', '')
            .replace(/^\//, '')
            .replace(/\//g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        return `
            <div class="container-fluid">
                <div class="row">
                    <div class="col-12">
                        <div class="card mt-4">
                            <div class="card-body text-center py-5">
                                <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;"></div>
                                <h4>Carregando ${pageName}...</h4>
                                <p class="text-muted mt-2">Por favor, aguarde.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    getErrorHTML(error, pageUrl) {
        return `
            <div class="container-fluid">
                <div class="row">
                    <div class="col-12">
                        <div class="card mt-4">
                            <div class="card-body text-center py-5">
                                <div class="alert alert-danger">
                                    <h4 class="alert-heading">
                                        <i class="fas fa-exclamation-triangle me-2"></i>
                                        Erro ao carregar página
                                    </h4>
                                    <p>Não foi possível carregar: <strong>${pageUrl}</strong></p>
                                    <hr>
                                    <p class="mb-0">
                                        <small class="text-muted">Erro: ${error.message}</small>
                                    </p>
                                    <div class="mt-3">
                                        <button class="btn btn-primary me-2" onclick="window.app.loadPage('${pageUrl}')">
                                            <i class="fas fa-redo me-1"></i>Tentar novamente
                                        </button>
                                        <button class="btn btn-outline-secondary" onclick="window.app.loadPage('dashboard.html')">
                                            <i class="fas fa-home me-1"></i>Voltar ao Dashboard
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    async loadPage(pageUrl) {
        if (this.currentPage === pageUrl) return;
        
        const contentDiv = document.getElementById('app-content');
        if (!contentDiv) return;
        
        try {
            contentDiv.innerHTML = this.getLoadingHTML(pageUrl);
            
            const response = await fetch(pageUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const html = await response.text();
            
            if (pageUrl === 'escalas.html' || pageUrl === 'exclusoes.html' || pageUrl === 'perfil.html' || pageUrl === 'solicitacoes.html') {
                await this.loadSpecialPage(html, pageUrl);
            } else {
                const pageContent = this.extractContent(html, pageUrl);
                contentDiv.innerHTML = pageContent;
                
                if (pageUrl === 'dashboard.html') {
                    await this.loadDashboardScript();
                }
            }
            
            this.currentPage = pageUrl;
            this.updateActiveNav(pageUrl);
            
        } catch (error) {
            console.error(`❌ Erro ao carregar ${pageUrl}:`, error);
            contentDiv.innerHTML = this.getErrorHTML(error, pageUrl);
        }
    }
    
    async loadSpecialPage(html, pageUrl) {
        const contentDiv = document.getElementById('app-content');
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const navbar = doc.querySelector('#navbar');
        if (navbar) navbar.remove();
        
        const mainContent = doc.querySelector('main');
        if (mainContent) {
            contentDiv.innerHTML = mainContent.innerHTML;
            
            if (pageUrl === 'escalas.html') {
                await this.loadEscalasScript();
            } else if (pageUrl === 'exclusoes.html') {
                await this.loadExclusoesScript();
            } else if (pageUrl === 'perfil.html') {
                await this.loadPerfilScript();
            } else if (pageUrl === 'solicitacoes.html') {
                await this.loadSolicitacoesScript();
            }
        } else {
            contentDiv.innerHTML = '<div class="alert alert-danger">Erro: Conteúdo não encontrado</div>';
        }
    }
    
    async loadEscalasScript() {
        try {
            await this.loadExternalScripts();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const escalasModule = await import('./escalas.js');
            
            if (escalasModule && escalasModule.initEscalasSPA) {
                await escalasModule.initEscalasSPA();
            } else if (escalasModule && escalasModule.initEscalas) {
                await escalasModule.initEscalas();
            }
            
            this.addEscalasStyles();
            
        } catch (error) {
            console.error('❌ Erro ao carregar escalas:', error);
            this.showError(error);
        }
    }
    
    async loadExclusoesScript() {
        try {
            await this.loadExternalScripts();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const exclusoesModule = await import('./exclusoes.js');
            
            if (exclusoesModule && exclusoesModule.initExclusoesSPA) {
                await exclusoesModule.initExclusoesSPA();
            } else if (exclusoesModule && exclusoesModule.initExclusoes) {
                await exclusoesModule.initExclusoes();
            }
            
            this.addExclusoesStyles();
            
        } catch (error) {
            console.error('❌ Erro ao carregar exclusões:', error);
            this.showError(error);
        }
    }

    async loadPerfilScript() {
        try {
            await this.loadExternalScripts();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const perfilModule = await import('./perfil.js');
            
            if (perfilModule && perfilModule.initPerfilSPA) {
                await perfilModule.initPerfilSPA();
            } else if (perfilModule && perfilModule.initPerfil) {
                await perfilModule.initPerfil();
            }
            
            this.addPerfilStyles();
            
        } catch (error) {
            console.error('❌ Erro ao carregar perfil:', error);
            this.showError(error);
        }
    }

    async loadSolicitacoesScript() {
        try {
            await this.loadExternalScripts();
            await this.loadDatepicker();
            await this.loadGoogleDriveAPI();
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const solicitacoesModule = await import('./solicitacoes.js');
            
            if (solicitacoesModule && solicitacoesModule.initSolicitacoesSPA) {
                await solicitacoesModule.initSolicitacoesSPA();
            } else if (solicitacoesModule && solicitacoesModule.initSolicitacoes) {
                await solicitacoesModule.initSolicitacoes();
            }
            
            this.addSolicitacoesStyles();
            
        } catch (error) {
            console.error('❌ Erro ao carregar solicitações:', error);
            this.showError(error);
        }
    }

    async loadGoogleDriveAPI() {
        return new Promise((resolve) => {
            if (window.gapi && window.gapi.load) {
                console.log('✅ Google Drive API já carregada');
                resolve();
                return;
            }
            
            if (!document.querySelector('script[src*="apis.google.com"]')) {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.onload = () => {
                    console.log('✅ Google Drive API carregada pelo SPA');
                    setTimeout(resolve, 1000);
                };
                script.onerror = () => {
                    console.warn('⚠️ Não foi possível carregar Google Drive API');
                    resolve();
                };
                document.head.appendChild(script);
            } else {
                setTimeout(resolve, 1000);
            }
        });
    }

    async loadDatepicker() {
        return new Promise((resolve) => {
            if (document.querySelector('link[href*="flatpickr"]') && 
                document.querySelector('script[src*="flatpickr"]')) {
                resolve();
                return;
            }
            
            const linkCSS = document.createElement('link');
            linkCSS.rel = 'stylesheet';
            linkCSS.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
            linkCSS.onload = () => {
                const scriptMain = document.createElement('script');
                scriptMain.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
                scriptMain.onload = () => {
                    const scriptLocale = document.createElement('script');
                    scriptLocale.src = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/pt.js';
                    scriptLocale.onload = resolve;
                    scriptLocale.onerror = resolve;
                    document.head.appendChild(scriptLocale);
                };
                scriptMain.onerror = resolve;
                document.head.appendChild(scriptMain);
            };
            linkCSS.onerror = resolve;
            document.head.appendChild(linkCSS);
        });
    }

    addSolicitacoesStyles() {
        const styleId = 'solicitacoes-spa-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .table-warning { background-color: rgba(255, 193, 7, 0.1) !important; }
                .table-danger { background-color: rgba(220, 53, 69, 0.1) !important; }
                .status-icon { font-size: 1.2em; }
                .btn-group-sm { white-space: nowrap; }
                #divDiasMes .form-check { 
                    flex: 0 0 calc(100% / 7 - 8px); 
                    margin: 2px; 
                    min-width: 40px; 
                }
                @media (max-width: 768px) {
                    #divDiasMes .form-check { flex: 0 0 calc(100% / 4 - 8px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    addPerfilStyles() {
        const styleId = 'perfil-spa-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .avatar-circle { 
                    background-color: #8B0000 !important; 
                    color: white !important; 
                }
                .list-group-item.active { 
                    background-color: #0d6efd !important; 
                    border-color: #0d6efd !important; 
                }
            `;
            document.head.appendChild(style);
        }
    }

    addEscalasStyles() {
        const styleId = 'escalas-spa-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .escala-grupo-par { background-color: rgba(0, 123, 255, 0.05) !important; }
                .escala-grupo-impar { background-color: rgba(108, 117, 125, 0.05) !important; }
                .table-info { background-color: rgba(0, 123, 255, 0.1) !important; }
                .badge.bg-info { font-size: 0.7em; padding: 0.2em 0.4em; }
            `;
            document.head.appendChild(style);
        }
    }
    
    addExclusoesStyles() {
        const styleId = 'exclusoes-spa-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .escala-grupo-par { background-color: rgba(220, 53, 69, 0.05) !important; }
                .escala-grupo-impar { background-color: rgba(108, 117, 125, 0.05) !important; }
                .badge.bg-info { font-size: 0.7em; padding: 0.2em 0.4em; }
            `;
            document.head.appendChild(style);
        }
    }
  
    async loadExternalScripts() {
        return new Promise((resolve) => {
            const scripts = [
                'https://code.jquery.com/jquery-3.6.0.min.js',
                'https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js',
                'https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap5.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
            ];
            
            let loaded = 0;
            
            scripts.forEach(src => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    loaded++;
                    if (loaded === scripts.length) resolve();
                    return;
                }
                
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    loaded++;
                    if (loaded === scripts.length) resolve();
                };
                script.onerror = () => {
                    loaded++;
                    console.warn(`⚠️ Script não carregado: ${src}`);
                    if (loaded === scripts.length) resolve();
                };
                document.head.appendChild(script);
            });
        });
    }
    
    async loadDashboardScript() {
        try {
            const dashboardModule = await import('./dashboard.js');
            
            if (dashboardModule && dashboardModule.initDashboard) {
                await dashboardModule.initDashboard();
            } else {
                this.executeDashboardFallback();
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            this.executeDashboardFallback();
        }
    }

    executeDashboardFallback() {
        const userRE = sessionStorage.getItem('userRE') || '000000';
        const userName = sessionStorage.getItem('userName') || 'Usuário';
        const cleanName = userName.replace(/\.{3,}/g, '').replace(/\s*\(.*\)/g, '').trim();
        
        const dashboardContent = document.querySelector('#dashboard-content') || 
                                document.querySelector('.card-body');
        
        if (dashboardContent) {
            dashboardContent.innerHTML = `
                <h1 class="display-4 mb-4">Olá, ${cleanName}!</h1>
                <div class="alert alert-success" role="alert">
                    <h4 class="alert-heading">Bem-vindo ao Sistema SPA</h4>
                    <p>Dashboard carregado via Single Page Application.</p>
                    <hr>
                    <div class="mb-0">
                        <div class="row mb-2">
                            <div class="col-md-6">
                                <strong><i class="fas fa-id-card me-1"></i>RE:</strong> ${userRE}
                            </div>
                            <div class="col-md-6">
                                <strong><i class="fas fa-shield-alt me-1"></i>Nível:</strong> 
                                <span class="badge bg-secondary">Carregando...</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary me-2" onclick="window.app.loadPage('escalas.html')">
                        <i class="fas fa-calendar-alt me-1"></i>Ver Escalas
                    </button>
                    <button class="btn btn-outline-secondary" onclick="window.app.loadPage('dashboard.html')">
                        <i class="fas fa-redo me-1"></i>Recarregar Dashboard
                    </button>
                </div>
            `;
        }
    }

    extractContent(html, pageUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const elementsToRemove = [
            '#navbar',
            'nav',
            '.navbar',
            'script[src*="navbar"]',
            'link[href*="navbar"]',
            'script[src*="firebase-config"]',
            'script[src*="auth-check"]'
        ];
        
        elementsToRemove.forEach(selector => {
            doc.querySelectorAll(selector).forEach(el => el.remove());
        });
        
        if (pageUrl === 'dashboard.html') {
            const cardBody = doc.querySelector('.card-body');
            if (cardBody) {
                return `
                    <div class="container-fluid">
                        <div class="row">
                            <div class="col-12">
                                <div class="card mt-3">
                                    <div class="card-body" id="dashboard-content">
                                        ${cardBody.innerHTML}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        const mainContent = doc.querySelector('main, .container-fluid');
        return mainContent ? mainContent.innerHTML : doc.body.innerHTML;
    }
    
    updateActiveNav(pageUrl) {
        document.querySelectorAll('a[href$=".html"]').forEach(link => {
            const href = link.getAttribute('href');
            const isActive = href === pageUrl;
            
            link.classList.toggle('active', isActive);
            
            if (isActive) {
                link.style.pointerEvents = 'none';
                link.style.opacity = '0.7';
                link.style.color = '#fff';
            } else {
                link.style.pointerEvents = 'auto';
                link.style.opacity = '1';
                link.style.color = 'rgba(255, 255, 255, 0.8)';
            }
        });
        
        if (window.updateNavbarActiveMenu) {
            window.updateNavbarActiveMenu(pageUrl);
        }
    }
    
    showError(error) {
        const contentDiv = document.getElementById('app-content');
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="alert alert-danger m-4">
                    <h4>Erro de Autenticação</h4>
                    <p>${error.message}</p>
                    <a href="index.html" class="btn btn-primary">
                        Voltar ao Login
                    </a>
                </div>
            `;
        }
    }
}

if (window.location.pathname.includes('app.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new AppCore();
        
        if (window.app) {
            window.app.init();
        }
    });
} else {
    console.log(`📄 ${window.location.pathname.split('/').pop()} - Página independente, SPA não inicializado`);
}

export default AppCore;