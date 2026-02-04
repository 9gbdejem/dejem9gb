// solicitacoes.js - Sistema de Solicitações (SPA Compatível)
import { checkAuth } from './auth-check.js';

// Exportar funções principais para SPA
export async function initSolicitacoesSPA() {
    // console.log('🚀 Solicitações inicializando (SPA)...');
    await initSolicitacoes();
}

export async function initSolicitacoes() {
    try {
        // 1. Verificar autenticação - Nível 2+ apenas
        const { userData, re } = await checkAuth(2);
        
        // 2. Garantir dados no sessionStorage
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        // 3. Atualizar userGreeting no SPA
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        // 4. Renderizar página de solicitações
        renderSolicitacoes(userData, re);
        
        // console.log('✅ Solicitações carregado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro nas solicitações:', error);
        showSolicitacoesError(error);
    }
}

// Função para renderizar a página
function renderSolicitacoes(userData, re) {
    const solicitacoesContent = document.querySelector('#solicitacoes-content') || 
                               document.querySelector('.card-body');
    
    if (!solicitacoesContent) {
        console.warn('⚠️ Elemento das solicitações não encontrado');
        return;
    }
    
    // Determinar nível textual
    let nivelTexto = 'Moderador';
    if (userData.nivel === 1) nivelTexto = 'Administrador';
    
    solicitacoesContent.innerHTML = `
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <h4 class="mb-0">
                            <i class="fas fa-clipboard-list me-2"></i>
                            Sistema de Solicitações
                        </h4>
                    </div>
                    <div class="card-body">
                        <!-- Status do Acesso -->
                        <div class="alert alert-info mb-4">
                            <h5 class="alert-heading">
                                <i class="fas fa-shield-alt me-2"></i>
                                Acesso Autorizado
                            </h5>
                            <p class="mb-0">
                                Você tem acesso ao módulo de solicitações com nível: 
                                <strong class="badge bg-dark ms-1">${nivelTexto}</strong>
                            </p>
                        </div>
                        
                        <!-- Conteúdo Principal -->
                        <div class="text-center py-5">
                            <div class="display-1 text-muted mb-4">
                                <i class="fas fa-tools"></i>
                            </div>
                            <h2 class="text-primary">Em Desenvolvimento</h2>
                            <p class="lead text-muted mt-3">
                                O sistema de solicitações está em fase de desenvolvimento.
                            </p>
                            <p class="text-muted">
                                Em breve você poderá gerenciar todas as solicitações do sistema aqui.
                            </p>
                            
                            <div class="mt-4">
                                <div class="row justify-content-center">
                                    <div class="col-md-8">
                                        <div class="card">
                                            <div class="card-body">
                                                <h5 class="card-title">
                                                    <i class="fas fa-info-circle me-2"></i>
                                                    Funcionalidades Previstas
                                                </h5>
                                                <ul class="list-group list-group-flush">
                                                    <li class="list-group-item">
                                                        <i class="fas fa-check-circle text-success me-2"></i>
                                                        Criação de novas solicitações
                                                    </li>
                                                    <li class="list-group-item">
                                                        <i class="fas fa-check-circle text-success me-2"></i>
                                                        Aprovação/Reprovação de solicitações
                                                    </li>
                                                    <li class="list-group-item">
                                                        <i class="fas fa-check-circle text-success me-2"></i>
                                                        Histórico completo
                                                    </li>
                                                    <li class="list-group-item">
                                                        <i class="fas fa-check-circle text-success me-2"></i>
                                                        Notificações em tempo real
                                                    </li>
                                                    <li class="list-group-item">
                                                        <i class="fas fa-check-circle text-success me-2"></i>
                                                        Relatórios e estatísticas
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Botões de Navegação -->
                            <div class="mt-5">
                                <button class="btn btn-primary me-2" onclick="window.app ? window.app.loadPage('dashboard.html') : window.location.href='dashboard.html'">
                                    <i class="fas fa-home me-1"></i>Voltar ao Dashboard
                                </button>
                                <button class="btn btn-outline-secondary" onclick="window.app ? window.app.loadPage('escalas.html') : window.location.href='escalas.html'">
                                    <i class="fas fa-calendar-alt me-1"></i>Ir para Escalas
                                </button>
                            </div>
                        </div>
                        
                        <!-- Informações do Usuário (rodapé) -->
                        <div class="mt-4 pt-3 border-top">
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted">
                                        <i class="fas fa-user me-1"></i>
                                        Logado como: <strong>${userData.nome}</strong>
                                    </small>
                                </div>
                                <div class="col-md-6 text-end">
                                    <small class="text-muted">
                                        <i class="fas fa-clock me-1"></i>
                                        Último acesso: ${new Date().toLocaleDateString('pt-BR')}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Função para mostrar erro
function showSolicitacoesError(error) {
    const solicitacoesContent = document.querySelector('#solicitacoes-content') || 
                               document.querySelector('.card-body');
    
    if (solicitacoesContent) {
        solicitacoesContent.innerHTML = `
            <div class="alert alert-danger">
                <h4>Erro no Sistema de Solicitações</h4>
                <p>${error.message}</p>
                
                <div class="mt-3">
                    <button class="btn btn-primary me-2" onclick="location.reload()">
                        <i class="fas fa-redo me-1"></i>Tentar Novamente
                    </button>
                    
                    <button class="btn btn-outline-secondary" 
                            onclick="window.app ? window.app.loadPage('dashboard.html') : window.location.href='dashboard.html'">
                        <i class="fas fa-home me-1"></i>Voltar ao Dashboard
                    </button>
                </div>
            </div>
        `;
    }
}

// Se estiver carregando como página normal (não SPA)
if (!window.location.pathname.includes('app.html') && 
    !document.getElementById('app-content')) {
    
    console.log('🌐 Solicitações carregando como página normal...');
    document.addEventListener('DOMContentLoaded', async function() {
        // Carrega navbar primeiro
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        
        await initSolicitacoes();
    });
}

// Exportar função para SPA
export default initSolicitacoes;