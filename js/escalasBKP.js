import { database } from './firebase-config.js';
import { checkAuth } from './auth-check.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Variáveis globais
let allEscalas = [];
let filteredEscalas = [];
let currentPage = 1;
const itemsPerPage = 10;
let uniqueStations = new Set();

// Função específica para SPA
export async function initEscalasSPA() {
    console.log('📅 Escalas SPA inicializando...');
    
    try {
        const { userData, re } = await checkAuth(3);
        
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        await setupEscalas();
        
    } catch (error) {
        console.error('❌ Erro no escalas SPA:', error);
        showError('Erro: ' + error.message);
    }
}

// Função original (mantida para compatibilidade)
async function initEscalas() {
    console.log('📅 Página de Escalas carregando...');
    
    try {
        const { userData, re } = await checkAuth(3);
        
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        await loadNavbar();
        await setupEscalas();
        
    } catch (error) {
        console.error('❌ Erro ao carregar escalas:', error);
        if (error.message.includes('Nível de acesso insuficiente')) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = 'dashboard.html';
        }
    }
}

// Setup comum
async function setupEscalas() {
    setupEventListeners();
    await loadEscalados();
    populateFilters();
    applyFilters();
}

async function loadEscalados() {
    try {
        showLoading(true);
        
        const escaladosRef = ref(database, 'escalados');
        const snapshot = await get(escaladosRef);
        
        if (snapshot.exists()) {
            allEscalas = [];
            uniqueStations.clear();
            
            snapshot.forEach((childSnapshot) => {
                const escala = childSnapshot.val();
                const linhaKey = childSnapshot.key;
                
                if (linhaKey === 'linha1') return;
                
                escala.linhaId = linhaKey;
                
                if (escala.HorarioInic) {
                    escala.horarioInicio = decimalToTime(escala.HorarioInic);
                }
                if (escala.HorarioTerm) {
                    escala.horarioTermino = decimalToTime(escala.HorarioTerm);
                }
                
                escala.horarioFormatado = `${escala.horarioInicio || '--:--'} às ${escala.horarioTermino || '--:--'}`;
                
                allEscalas.push(escala);
                
                if (escala.Estacao) {
                    uniqueStations.add(escala.Estacao);
                }
            });
            
            allEscalas.sort((a, b) => {
                const dateA = parseDate(a.Data);
                const dateB = parseDate(b.Data);
                return dateB - dateA;
            });
            
            console.log(`✅ ${allEscalas.length} escalas carregadas`);
            
        } else {
            console.log('📭 Nenhuma escala encontrada');
            allEscalas = [];
            showMessage('Nenhuma escala cadastrada no sistema.', 'info');
        }
        
    } catch (error) {
        console.error('💥 Erro ao carregar escalas:', error);
        showError('Erro ao carregar escalas: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function decimalToTime(decimal) {
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function parseDate(dateString) {
    if (!dateString) return new Date();
    const [day, month, year] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = parseDate(dateString);
    return date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 6);
            applyFilters();
        });
    }
    
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) monthFilter.addEventListener('change', applyFilters);
    
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) stationFilter.addEventListener('change', applyFilters);
    
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) refreshBtn.addEventListener('click', loadEscalados);
    
    const exportBtn = document.getElementById('exportExcel');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
}

function populateFilters() {
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        const sortedStations = Array.from(uniqueStations).sort();
        
        while (stationFilter.options.length > 1) {
            stationFilter.remove(1);
        }
        
        sortedStations.forEach(station => {
            const option = document.createElement('option');
            option.value = station;
            option.textContent = station;
            stationFilter.appendChild(option);
        });
    }
}

function applyFilters() {
    const reFilter = document.getElementById('searchRE').value.trim();
    const monthFilter = document.getElementById('filterMonth').value;
    const stationFilter = document.getElementById('filterStation').value;
    
    filteredEscalas = allEscalas.filter(escala => {
        if (reFilter && escala.RE) {
            const reString = escala.RE.toString();
            if (!reString.includes(reFilter)) return false;
        }
        
        if (monthFilter && escala.mês) {
            if (escala.mês.toString() !== monthFilter) return false;
        }
        
        if (stationFilter && escala.Estacao) {
            if (escala.Estacao !== stationFilter) return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTable();
    updateStatistics();
}

function clearFilters() {
    document.getElementById('searchRE').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterStation').value = '';
    
    filteredEscalas = [...allEscalas];
    currentPage = 1;
    renderTable();
    updateStatistics();
    
    showMessage('Filtros limpos com sucesso.', 'success');
}

function renderTable() {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    const infoText = document.getElementById('infoText');
    const pagination = document.getElementById('pagination');
    
    if (!tbody || !noDataDiv || !infoText || !pagination) {
        console.error('❌ Elementos da tabela não encontrados');
        return;
    }
    
    if (filteredEscalas.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        infoText.textContent = 'Mostrando 0 de 0 registros';
        pagination.innerHTML = '';
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    const totalPages = Math.ceil(filteredEscalas.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredEscalas.length);
    const pageEscalas = filteredEscalas.slice(startIndex, endIndex);
    
    let html = '';
    const userRE = sessionStorage.getItem('userRE');
    
    pageEscalas.forEach((escala, index) => {
        const globalIndex = startIndex + index + 1;
        const isUserEscala = userRE && escala.RE && escala.RE.toString() === userRE;
        
        html += `
            <tr class="${isUserEscala ? 'table-info' : ''}" data-escala-id="${escala.linhaId}">
                <td>
                    <div class="fw-bold">${escala.Militar || '-'}</div>
                    ${isUserEscala ? '<small class="text-primary">(Sua escala)</small>' : ''}
                </td>
                <td><span class="badge bg-dark">${escala.RE || '-'}</span></td>
                <td>${escala.Posto_Grad || '-'}</td>
                <td>${escala.OPM || '-'}</td>
                <td><span class="badge bg-secondary">${escala.Estacao || '-'}</span></td>
                <td><span class="badge ${getComposicaoColor(escala.Composicao)}">${escala.Composicao || '-'}</span></td>
                <td><i class="fas fa-calendar me-1 text-muted"></i>${formatDate(escala.Data)}</td>
                <td><i class="fas fa-clock me-1 text-muted"></i>${escala.horarioFormatado || '-'}</td>
                <td><small class="text-muted">${escala.Id || '-'}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewDetalhes('${escala.linhaId}')" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    infoText.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filteredEscalas.length} registros`;
    renderPagination(totalPages);
}

function getComposicaoColor(composicao) {
    if (!composicao) return 'bg-secondary';
    
    const cores = {
        'INCÊNDIO OU RESGATE': 'bg-danger',
        'GUARNIÇÃO DE SALVAMENTO': 'bg-success',
        'RESGATE': 'bg-warning',
        'SOCORRO': 'bg-info',
        'EMERGÊNCIA': 'bg-primary'
    };
    
    for (const [key, value] of Object.entries(cores)) {
        if (composicao.includes(key)) return value;
    }
    
    return 'bg-secondary';
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

window.changePage = function(page) {
    if (page < 1 || page > Math.ceil(filteredEscalas.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
};

function updateStatistics() {
    document.getElementById('totalEscalas').textContent = filteredEscalas.length;
    document.getElementById('totalEstacoes').textContent = getUniqueStationsCount();
    document.getElementById('totalMilitares').textContent = getUniqueMilitaresCount();
    document.getElementById('mesAtual').textContent = getCurrentMonthName();
}

function getUniqueStationsCount() {
    const stations = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.Estacao) stations.add(escala.Estacao);
    });
    return stations.size;
}

function getUniqueMilitaresCount() {
    const militares = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.RE) militares.add(escala.RE);
    });
    return militares.size;
}

function getCurrentMonthName() {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const monthCounts = {};
    filteredEscalas.forEach(escala => {
        if (escala.mês) {
            monthCounts[escala.mês] = (monthCounts[escala.mês] || 0) + 1;
        }
    });
    
    let mostCommonMonth = 0;
    let maxCount = 0;
    
    for (const [month, count] of Object.entries(monthCounts)) {
        if (count > maxCount) {
            maxCount = count;
            mostCommonMonth = parseInt(month);
        }
    }
    
    return mostCommonMonth > 0 ? months[mostCommonMonth - 1] : '-';
}

window.viewDetalhes = function(linhaId) {
    const escala = allEscalas.find(e => e.linhaId === linhaId);
    if (!escala) return;
    
    const modal = new bootstrap.Modal(document.getElementById('detalhesModal'));
    const content = document.getElementById('detalhesContent');
    
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Informações do Militar</h6>
                <table class="table table-sm">
                    <tr><th width="40%">Nome:</th><td><strong>${escala.Militar || '-'}</strong></td></tr>
                    <tr><th>RE:</th><td><span class="badge bg-dark">${escala.RE || '-'}</span></td></tr>
                    <tr><th>Posto/Grad:</th><td>${escala.Posto_Grad || '-'}</td></tr>
                    <tr><th>OPM:</th><td>${escala.OPM || '-'}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Detalhes da Escala</h6>
                <table class="table table-sm">
                    <tr><th width="40%">ID:</th><td>${escala.Id || '-'}</td></tr>
                    <tr><th>Data:</th><td>${formatDate(escala.Data)}</td></tr>
                    <tr><th>Horário:</th><td>${escala.horarioFormatado || '-'}</td></tr>
                    <tr><th>Estação:</th><td><span class="badge bg-secondary">${escala.Estacao || '-'}</span></td></tr>
                </table>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-12">
                <h6>Composição</h6>
                <div class="alert ${getComposicaoColor(escala.Composicao).replace('bg-', 'alert-')}">
                    <strong><i class="fas fa-car me-1"></i>${escala.Composicao || 'Não especificada'}</strong>
                </div>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-md-6">
                <h6>Informações Adicionais</h6>
                <p class="mb-1"><strong>Mês:</strong> ${escala.mês || '-'}</p>
                <p class="mb-1"><strong>Conferência:</strong> ${escala.conferencia || '-'}</p>
                ${escala.Ausente ? `<p class="mb-1"><strong>Ausente:</strong> ${escala.Ausente}</p>` : ''}
                ${escala.Documento ? `<p class="mb-1"><strong>Documento:</strong> ${escala.Documento}</p>` : ''}
                ${escala['Exclusão'] ? `<p class="mb-1"><strong>Exclusão:</strong> ${escala['Exclusão']}</p>` : ''}
            </div>
            <div class="col-md-6">
                <h6>Horários Detalhados</h6>
                <table class="table table-sm">
                    <tr><th width="50%">Início (decimal):</th><td>${escala.HorarioInic || '0'}</td></tr>
                    <tr><th>Início (formatado):</th><td>${escala.horarioInicio || '-'}</td></tr>
                    <tr><th>Término (decimal):</th><td>${escala.HorarioTerm || '0'}</td></tr>
                    <tr><th>Término (formatado):</th><td>${escala.horarioTermino || '-'}</td></tr>
                </table>
            </div>
        </div>
    `;
    
    modal.show();
};

function exportToExcel() {
    try {
        if (filteredEscalas.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        const wsData = filteredEscalas.map(escala => ({
            'RE': escala.RE || '',
            'Militar': escala.Militar || '',
            'Posto/Grad': escala.Posto_Grad || '',
            'OPM': escala.OPM || '',
            'Estação': escala.Estacao || '',
            'Composição': escala.Composicao || '',
            'Data': escala.Data || '',
            'Horário Início': escala.horarioInicio || '',
            'Horário Término': escala.horarioTermino || '',
            'ID': escala.Id || '',
            'Mês': escala.mês || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        
        const wscols = [
            {wch: 8}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 20},
            {wch: 25}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 6}
        ];
        ws['!cols'] = wscols;
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Escalas');
        
        const today = new Date().toISOString().split('T')[0];
        const fileName = `escalas_${today}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        
        showMessage(`Arquivo ${fileName} gerado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

function showLoading(show) {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    
    if (show) {
        if (tbody) tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 text-muted">Carregando escalas...</p>
                </td>
            </tr>
        `;
        if (noDataDiv) noDataDiv.classList.add('d-none');
    }
}

function showMessage(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) alertDiv.remove();
    }, 3000);
}

function showError(message) {
    showMessage(message, 'danger');
}

// Carregar navbar (função auxiliar para modo tradicional)
async function loadNavbar() {
    try {
        const { loadNavbar } = await import('./auth-check.js');
        return loadNavbar();
    } catch (error) {
        console.warn('⚠️ Não foi possível carregar navbar:', error);
    }
}

// Inicializar modo tradicional
if (!window.location.pathname.includes('app.html')) {
    document.addEventListener('DOMContentLoaded', initEscalas);
}