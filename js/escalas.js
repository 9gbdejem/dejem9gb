import { database } from './firebase-config.js';
import { checkAuth, loadNavbar } from './auth-check.js';
import { ref, get, query, orderByChild } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Variáveis globais
let allEscalas = [];
let currentFilterRE = '';
let dataTable = null;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📅 Página de Escalas carregando...');
    
    try {
        // Verificar autenticação (nível 3 = todos têm acesso)
        const { user, userData, re } = await checkAuth(3);
        
        console.log('✅ Acesso permitido para escalas:', {
            nome: userData.nome,
            re: re
        });
        
        // Carregar navbar
        loadNavbar();
        
        // Configurar elementos
        setupEventListeners();
        
        // Carregar escalas
        await loadEscalas();
        
        // Configurar logout
        setupLogout();
        
    } catch (error) {
        console.error('❌ Erro ao carregar escalas:', error);
        // Redirecionar para dashboard se não tiver acesso
        if (error.message.includes('Nível de acesso insuficiente')) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = 'dashboard.html';
        }
    }
});

// Configurar eventos
function setupEventListeners() {
    // Busca por RE
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 6);
            filterByRE(this.value);
        });
        
        // Permitir Enter para buscar
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                filterByRE(this.value);
            }
        });
    }
    
    // Limpar busca
    document.getElementById('clearSearch').addEventListener('click', function() {
        searchInput.value = '';
        filterByRE('');
    });
    
    // Atualizar dados
    document.getElementById('refreshBtn').addEventListener('click', loadEscalas);
    
    // Exportar para Excel
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
}

// Carregar escalas do Firebase
async function loadEscalas() {
    try {
        console.log('📥 Carregando escalas...');
        
        const escalasRef = ref(database, 'escalas');
        const snapshot = await get(escalasRef);
        
        if (snapshot.exists()) {
            allEscalas = [];
            snapshot.forEach((childSnapshot) => {
                const escala = childSnapshot.val();
                escala.id = childSnapshot.key;
                allEscalas.push(escala);
            });
            
            console.log(`✅ ${allEscalas.length} escalas carregadas`);
            updateStatistics(allEscalas);
            renderTable(allEscalas);
        } else {
            console.log('📭 Nenhuma escala encontrada');
            allEscalas = [];
            renderTable([]);
        }
        
    } catch (error) {
        console.error('💥 Erro ao carregar escalas:', error);
        showError('Erro ao carregar escalas: ' + error.message);
    }
}

// Filtrar por RE
function filterByRE(re) {
    currentFilterRE = re;
    
    if (!re) {
        renderTable(allEscalas);
        document.getElementById('reFiltrado').textContent = '-';
        return;
    }
    
    document.getElementById('reFiltrado').textContent = re;
    
    const filtered = allEscalas.filter(escala => {
        // Extrair RE da guarnição (primeiros 6 dígitos)
        const reGuarnicao = escala.guarnicao ? escala.guarnicao.substring(0, 6) : '';
        return reGuarnicao === re;
    });
    
    renderTable(filtered);
}

// Renderizar tabela
function renderTable(escalas) {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    
    if (escalas.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        updateStatistics([]);
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    // Ordenar por data (mais recente primeiro)
    escalas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let html = '';
    
    escalas.forEach((escala, index) => {
        // Extrair RE e nome da guarnição
        const guarnicao = escala.guarnicao || '';
        const reGuarnicao = guarnicao.substring(0, 6);
        const nomeGuarnicao = guarnicao.substring(7);
        
        // Destacar se for o RE buscado
        const isHighlighted = currentFilterRE && reGuarnicao === currentFilterRE;
        
        html += `
            <tr class="${isHighlighted ? 'table-info' : ''}">
                <td>
                    <div class="fw-bold ${isHighlighted ? 'text-primary' : ''}">${reGuarnicao}</div>
                    <small class="text-muted">${nomeGuarnicao}</small>
                </td>
                <td>${escala.local || '-'}</td>
                <td>${escala.composicao || '-'}</td>
                <td>
                    <span class="badge bg-secondary">${escala.horario || '-'}</span>
                </td>
                <td>
                    <span class="badge bg-dark">${escala.id || '-'}</span>
                </td>
                <td>
                    ${escala.confirmacao ? 
                        '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Confirmada</span>' : 
                        '<span class="badge bg-warning"><i class="fas fa-clock me-1"></i>Pendente</span>'}
                </td>
                <td>
                    ${escala.documento ? 
                        `<a href="#" class="text-decoration-none" onclick="viewDocument('${escala.documento}')">
                            <i class="fas fa-file-pdf me-1"></i>${escala.documento}
                         </a>` : 
                        '-'}
                </td>
                <td>
                    ${escala.data ? formatDate(escala.data) : '-'}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewDetails('${escala.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${escala.confirmacao === false ? 
                        `<button class="btn btn-sm btn-outline-success ms-1" onclick="confirmEscala('${escala.id}')">
                            <i class="fas fa-check"></i>
                        </button>` : ''}
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updateStatistics(escalas);
}

// Atualizar estatísticas
function updateStatistics(escalas) {
    const total = escalas.length;
    const confirmadas = escalas.filter(e => e.confirmacao).length;
    const pendentes = total - confirmadas;
    
    document.getElementById('totalEscalas').textContent = total;
    document.getElementById('confirmadas').textContent = confirmadas;
    document.getElementById('pendentes').textContent = pendentes;
}

// Formatar data
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// Ver detalhes
function viewDetails(escalaId) {
    const escala = allEscalas.find(e => e.id === escalaId);
    if (!escala) return;
    
    const modal = new bootstrap.Modal(document.getElementById('detalhesModal'));
    const content = document.getElementById('detalhesContent');
    
    // Extrair RE e nome
    const guarnicao = escala.guarnicao || '';
    const reGuarnicao = guarnicao.substring(0, 6);
    const nomeGuarnicao = guarnicao.substring(7);
    
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Informações da Guarnição</h6>
                <table class="table table-sm">
                    <tr>
                        <th width="40%">RE:</th>
                        <td><strong>${reGuarnicao}</strong></td>
                    </tr>
                    <tr>
                        <th>Nome:</th>
                        <td>${nomeGuarnicao}</td>
                    </tr>
                    <tr>
                        <th>Local:</th>
                        <td>${escala.local || '-'}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Detalhes da Escala</h6>
                <table class="table table-sm">
                    <tr>
                        <th width="40%">ID:</th>
                        <td>${escala.id || '-'}</td>
                    </tr>
                    <tr>
                        <th>Data:</th>
                        <td>${formatDate(escala.data) || '-'}</td>
                    </tr>
                    <tr>
                        <th>Horário:</th>
                        <td>${escala.horario || '-'}</td>
                    </tr>
                </table>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-12">
                <h6>Composição</h6>
                <div class="alert alert-light">
                    ${escala.composicao || 'Não especificada'}
                </div>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-md-6">
                <h6>Documento</h6>
                <p>${escala.documento || 'Não informado'}</p>
            </div>
            <div class="col-md-6">
                <h6>Status</h6>
                <div class="d-flex align-items-center">
                    ${escala.confirmacao ? 
                        '<span class="badge bg-success p-2"><i class="fas fa-check me-1"></i>Confirmada</span>' : 
                        '<span class="badge bg-warning p-2"><i class="fas fa-clock me-1"></i>Pendente de Confirmação</span>'}
                    ${escala.confirmacao === false ? 
                        `<button class="btn btn-sm btn-success ms-3" onclick="confirmEscala('${escala.id}')">
                            <i class="fas fa-check me-1"></i>Confirmar Escala
                        </button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    modal.show();
}

// Confirmar escala (simulação)
function confirmEscala(escalaId) {
    if (confirm('Deseja confirmar esta escala?')) {
        console.log('✅ Escala confirmada:', escalaId);
        // Aqui você implementaria a lógica para atualizar no Firebase
        showSuccess('Escala confirmada com sucesso!');
        
        // Recarregar dados
        setTimeout(() => loadEscalas(), 1000);
    }
}

// Visualizar documento (simulação)
function viewDocument(documento) {
    alert(`Visualizando documento: ${documento}\n\nEm produção, isso abriria o PDF do documento.`);
}

// Exportar para Excel
function exportToExcel() {
    try {
        const dataToExport = currentFilterRE ? 
            allEscalas.filter(e => e.guarnicao?.substring(0, 6) === currentFilterRE) : 
            allEscalas;
        
        if (dataToExport.length === 0) {
            alert('Nenhum dado para exportar!');
            return;
        }
        
        // Preparar dados
        const wsData = dataToExport.map(escala => {
            const re = escala.guarnicao ? escala.guarnicao.substring(0, 6) : '';
            const nome = escala.guarnicao ? escala.guarnicao.substring(7) : '';
            
            return {
                'RE': re,
                'Nome': nome,
                'Local': escala.local || '',
                'Composição': escala.composicao || '',
                'Horário': escala.horario || '',
                'ID Escala': escala.id || '',
                'Confirmação': escala.confirmacao ? 'Confirmada' : 'Pendente',
                'Documento': escala.documento || '',
                'Data': escala.data || ''
            };
        });
        
        // Criar worksheet
        const ws = XLSX.utils.json_to_sheet(wsData);
        
        // Criar workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Escalas');
        
        // Gerar nome do arquivo
        const fileName = currentFilterRE ? 
            `escalas_re_${currentFilterRE}_${new Date().toISOString().split('T')[0]}.xlsx` : 
            `todas_escalas_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Salvar arquivo
        XLSX.writeFile(wb, fileName);
        
        showSuccess(`Arquivo ${fileName} gerado com sucesso!`);
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

// Configurar logout
function setupLogout() {
    // O navbar já cuida do logout, mas mantemos compatibilidade
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            if (window.navbarFunctions && window.navbarFunctions.performLogout) {
                await window.navbarFunctions.performLogout();
            } else {
                sessionStorage.clear();
                window.location.href = 'index.html';
            }
        });
    }
}

// Funções de notificação
function showError(message) {
    alert('❌ ' + message);
}

function showSuccess(message) {
    alert('✅ ' + message);
}

// Tornar funções disponíveis globalmente para onclick
window.viewDetails = viewDetails;
window.confirmEscala = confirmEscala;
window.viewDocument = viewDocument;