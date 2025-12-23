import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { checkAuth, loadNavbar } from './auth-check.js';

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Dashboard carregando...');
    
    try {
        // Verificar autenticação (nível 1)
        const { user, userData, re } = await checkAuth(3);
        
        console.log('✅ Dashboard acessado:', {
            nome: userData.nome,
            re: re,
            nivel: userData.nivel
        });
        
        // Carregar navbar
        await loadNavbar();
        
        // Personalizar dashboard
        customizeDashboard(userData, re);
        
    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
    }
});

function customizeDashboard(userData, re) {
    const cardBody = document.querySelector('.card-body');
    if (!cardBody || !userData.nome) return;
    
    // Determinar cor do badge
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
        <h1 class="display-4 mb-4">Olá, ${userData.nome}!</h1>
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
        <p class="mt-3">
            <a href="escalas.html" class="btn btn-primary me-2">
                <i class="fas fa-calendar-alt me-1"></i>Ver Escalas
            </a>
            <button class="btn btn-outline-secondary" onclick="location.reload()">
                <i class="fas fa-redo me-1"></i>Atualizar
            </button>
        </p>
    `;
}