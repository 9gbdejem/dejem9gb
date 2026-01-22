// dashboard.js - VERSÃO DEFINITIVA PARA SPA
import { checkAuth } from './auth-check.js';

// Exportar as funções principais
export async function initDashboard() {
    console.log('🚀 Dashboard inicializando (SPA)...');
    
    try {
        // 1. Verificar autenticação
        const { userData, re } = await checkAuth(3);
        
        console.log('📋 Dados do usuário:', {
            re: re,
            nome: userData.nome,
            nivel: userData.nivel
        });
        
        // 2. Garantir dados no sessionStorage
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        // 3. Atualizar userGreeting no SPA
        if (window.updateUserGreetingInSPA) {
            console.log('🔄 Atualizando userGreeting via SPA...');
            window.updateUserGreetingInSPA();
        }
        
        // 4. Personalizar dashboard
        customizeDashboard(userData, re);
        
        console.log('✅ Dashboard carregado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
        showDashboardError(error);
    }
}

export function customizeDashboard(userData, re) {
    // Buscar o card-body dentro do SPA
    const cardBody = document.querySelector('#dashboard-content') || 
                     document.querySelector('.card-body');
    
    if (!cardBody || !userData.nome) {
        console.warn('⚠️ Elemento do dashboard não encontrado');
        return;
    }
    
    let nivelClass = 'secondary';
    let nivelTexto = 'Básico';
    
    if (userData.nivel === 1) {
        nivelClass = 'danger';
        nivelTexto = 'Administrador';
    } else if (userData.nivel === 2) {
        nivelClass = 'warning';
        nivelTexto = 'Moderador';
    }
    
    cardBody.innerHTML = `
        <div class="alert alert-success" role="alert">
            <h4 class="alert-heading">Bem-vindo ao Sistema</h4>
            <p>Seu acesso foi verificado com sucesso.</p>
            <hr>
            <div class="mb-0">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <strong><i class="fas fa-id-card me-1"></i>RE:</strong> ${re}
                    </div>
                    <div class="col-md-6">
                        <strong><i class="fas fa-shield-alt me-1"></i>Nível:</strong> 
                        <span class="badge bg-${nivelClass}">${nivelTexto}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function showDashboardError(error) {
    const cardBody = document.querySelector('#dashboard-content') || 
                     document.querySelector('.card-body');
    
    if (cardBody) {
        cardBody.innerHTML = `
            <div class="alert alert-danger">
                <h4>Erro no Dashboard</h4>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="window.app.loadPage('dashboard.html')">
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

// Se estiver carregando como página normal (não SPA)
if (!window.location.pathname.includes('app.html') && 
    !document.getElementById('app-content')) {
    
    console.log('🌐 Dashboard carregando como página normal...');
    document.addEventListener('DOMContentLoaded', async function() {
        // Carrega navbar primeiro
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        
        await initDashboard();
    });
}