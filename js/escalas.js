// js/escalas.js - Sistema de Escalas completo
import { database } from './firebase-config.js';
import { checkAuth, loadNavbar } from './auth-check.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Variáveis globais
let allEscalas = [];
let filteredEscalas = [];
let currentPage = 1;
const itemsPerPage = 10;
let uniqueStations = new Set();

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
        await loadNavbar();
        
        // Configurar elementos
        setupEventListeners();
        
        // Carregar escalas
        await loadEscalados();
        
        // Preencher filtros
        populateFilters();
        
    } catch (error) {
        console.error('❌ Erro ao carregar escalas:', error);
        if (error.message.includes('Nível de acesso insuficiente')) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = 'dashboard.html';
        }
    }
});

// Carregar escalas do nó "escalados"
async function loadEscalados() {
    try {
        console.log('📥 Carregando escalados...');
        
        const escaladosRef = ref(database, 'escalados');
        const snapshot = await get(escaladosRef);
        
        if (snapshot.exists()) {
            allEscalas = [];
            uniqueStations.clear();
            
            snapshot.forEach((childSnapshot) => {
                const escala = childSnapshot.val();
                const linhaKey = childSnapshot.key;
                
                // Pular linha de cabeçalho (linha1)
                if (linhaKey === 'linha1') return;
                
                // Adicionar ID da linha para referência
                escala.linhaId = linhaKey;
                
                // Converter horários de decimal para hora legível
                if (escala.HorarioInic) {
                    escala.horarioInicio = decimalToTime(escala.HorarioInic);
                }
                if (escala.HorarioTerm) {
                    escala.horarioTermino = decimalToTime(escala.HorarioTerm);
                }
                
                // Criar string de horário combinado
                escala.horarioFormatado = `${escala.horarioInicio || '--:--'} às ${escala.horarioTermino || '--:--'}`;
                
                // Adicionar ao array
                allEscalas.push(escala);
                
                // Coletar estações únicas para filtro
                if (escala.Estacao) {
                    uniqueStations.add(escala.Estacao);
                }
            });
            
            // Ordenar por data (mais recente primeiro)
            allEscalas.sort((a, b) => {
                const dateA = parseDate(a.Data);
                const dateB = parseDate(b.Data);
                return dateB - dateA;
            });
            
            console.log(`✅ ${allEscalas.length} escalas carregadas`);
            console.log(`📍 ${uniqueStations.size} estações encontradas`);
            
            // Aplicar filtro inicial (todos)
            filteredEscalas = [...allEscalas];
            renderTable();
            updateStatistics();
            
        } else {
            console.log('📭 Nenhuma escala encontrada no nó escalados');
            allEscalas = [];
            filteredEscalas = [];
            renderTable();
            showMessage('Nenhuma escala cadastrada no sistema.', 'info');
        }
        
    } catch (error) {
        console.error('💥 Erro ao carregar escalas:', error);
        showError('Erro ao carregar escalas: ' + error.message);
    }
}

// Converter decimal para horário (0.5 = 12:00)
function decimalToTime(decimal) {
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Parse data no formato dd/mm/yyyy
function parseDate(dateString) {
    if (!dateString) return new Date();
    const [day, month, year] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
}

// Formatar data para exibição
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

// Configurar eventos
function setupEventListeners() {
    // Filtro por RE
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 6);
            applyFilters();
        });
    }
    
    // Filtro por mês
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) {
        monthFilter.addEventListener('change', applyFilters);
    }
    
    // Filtro por estação
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        stationFilter.addEventListener('change', applyFilters);
    }
    
    // Limpar filtros
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    
    // Atualizar dados
    document.getElementById('refreshData').addEventListener('click', loadEscalados);
    
    // Exportar Excel
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
}

// Preencher filtros com dados dinâmicos
function populateFilters() {
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        // Ordenar estações alfabeticamente
        const sortedStations = Array.from(uniqueStations).sort();
        
        // Limpar opções existentes (exceto a primeira)
        while (stationFilter.options.length > 1) {
            stationFilter.remove(1);
        }
        
        // Adicionar estações
        sortedStations.forEach(station => {
            const option = document.createElement('option');
            option.value = station;
            option.textContent = station;
            stationFilter.appendChild(option);
        });
    }
}

// Aplicar todos os filtros
function applyFilters() {
    const reFilter = document.getElementById('searchRE').value.trim();
    const monthFilter = document.getElementById('filterMonth').value;
    const stationFilter = document.getElementById('filterStation').value;
    
    filteredEscalas = allEscalas.filter(escala => {
        // Filtro por RE
        if (reFilter && escala.RE) {
            const reString = escala.RE.toString();
            if (!reString.includes(reFilter)) {
                return false;
            }
        }
        
        // Filtro por mês
        if (monthFilter && escala.mês) {
            if (escala.mês.toString() !== monthFilter) {
                return false;
            }
        }
        
        // Filtro por estação
        if (stationFilter && escala.Estacao) {
            if (escala.Estacao !== stationFilter) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1; // Voltar para primeira página
    renderTable();
    updateStatistics();
}

// Limpar todos os filtros
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

// Renderizar tabela com paginação
function renderTable() {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    const infoText = document.getElementById('infoText');
    const pagination = document.getElementById('pagination');
    
    if (filteredEscalas.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        infoText.textContent = 'Mostrando 0 de 0 registros';
        pagination.innerHTML = '';
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    // Calcular paginação
    const totalPages = Math.ceil(filteredEscalas.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredEscalas.length);
    const pageEscalas = filteredEscalas.slice(startIndex, endIndex);
    
    // Renderizar linhas da página atual
    let html = '';
    
    pageEscalas.forEach((escala, index) => {
        const globalIndex = startIndex + index + 1;
        
        // Destacar linha se for do RE do usuário logado
        const userRE = sessionStorage.getItem('userRE');
        const isUserEscala = userRE && escala.RE && escala.RE.toString() === userRE;
        
        html += `
            <tr class="${isUserEscala ? 'table-info' : ''}" data-escala-id="${escala.linhaId}">
                <td>
                    <div class="fw-bold">${escala.Militar || '-'}</div>
                    ${isUserEscala ? '<small class="text-primary">(Sua escala)</small>' : ''}
                </td>
                <td>
                    <span class="badge bg-dark">${escala.RE || '-'}</span>
                </td>
                <td>${escala.Posto_Grad || '-'}</td>
                <td>${escala.OPM || '-'}</td>
                <td>
                    <span class="badge bg-secondary">${escala.Estacao || '-'}</span>
                </td>
                <td>
                    <span class="badge ${getComposicaoColor(escala.Composicao)}">
                        ${escala.Composicao || '-'}
                    </span>
                </td>
                <td>
                    <i class="fas fa-calendar me-1 text-muted"></i>
                    ${formatDate(escala.Data)}
                </td>
                <td>
                    <i class="fas fa-clock me-1 text-muted"></i>
                    ${escala.horarioFormatado || '-'}
                </td>
                <td>
                    <small class="text-muted">${escala.Id || '-'}</small>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewDetalhes('${escala.linhaId}')"
                            title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Atualizar informações de paginação
    infoText.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filteredEscalas.length} registros`;
    
    // Renderizar paginação
    renderPagination(totalPages);
}

// Cor da badge baseada na composição
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

// Renderizar controles de paginação
function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Botão anterior
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Páginas
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
    
    // Botão próximo
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

// Mudar página
window.changePage = function(page) {
    if (page < 1 || page > Math.ceil(filteredEscalas.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
};

// Atualizar estatísticas
function updateStatistics() {
    document.getElementById('totalEscalas').textContent = filteredEscalas.length;
    document.getElementById('totalEstacoes').textContent = getUniqueStationsCount();
    document.getElementById('totalMilitares').textContent = getUniqueMilitaresCount();
    document.getElementById('mesAtual').textContent = getCurrentMonthName();
}

// Contar estações únicas
function getUniqueStationsCount() {
    const stations = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.Estacao) stations.add(escala.Estacao);
    });
    return stations.size;
}

// Contar militares únicos
function getUniqueMilitaresCount() {
    const militares = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.RE) militares.add(escala.RE);
    });
    return militares.size;
}

// Obter nome do mês atual
function getCurrentMonthName() {
    const months = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    
    // Encontrar mês mais frequente nas escalas filtradas
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

// Ver detalhes da escala
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
                    <tr>
                        <th width="40%">Nome:</th>
                        <td><strong>${escala.Militar || '-'}</strong></td>
                    </tr>
                    <tr>
                        <th>RE:</th>
                        <td><span class="badge bg-dark">${escala.RE || '-'}</span></td>
                    </tr>
                    <tr>
                        <th>Posto/Grad:</th>
                        <td>${escala.Posto_Grad || '-'}</td>
                    </tr>
                    <tr>
                        <th>OPM:</th>
                        <td>${escala.OPM || '-'}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Detalhes da Escala</h6>
                <table class="table table-sm">
                    <tr>
                        <th width="40%">ID:</th>
                        <td>${escala.Id || '-'}</td>
                    </tr>
                    <tr>
                        <th>Data:</th>
                        <td>${formatDate(escala.Data)}</td>
                    </tr>
                    <tr>
                        <th>Horário:</th>
                        <td>${escala.horarioFormatado || '-'}</td>
                    </tr>
                    <tr>
                        <th>Estacao:</th>
                        <td><span class="badge bg-secondary">${escala.Estacao || '-'}</span></td>
                    </tr>
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
                    <tr>
                        <th width="50%">Início (decimal):</th>
                        <td>${escala.HorarioInic || '0'}</td>
                    </tr>
                    <tr>
                        <th>Início (formatado):</th>
                        <td>${escala.horarioInicio || '-'}</td>
                    </tr>
                    <tr>
                        <th>Término (decimal):</th>
                        <td>${escala.HorarioTerm || '0'}</td>
                    </tr>
                    <tr>
                        <th>Término (formatado):</th>
                        <td>${escala.horarioTermino || '-'}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;
    
    modal.show();
};

// Exportar para Excel
function exportToExcel() {
    try {
        if (filteredEscalas.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        // Preparar dados
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
        
        // Criar worksheet
        const ws = XLSX.utils.json_to_sheet(wsData);
        
        // Ajustar largura das colunas
        const wscols = [
            {wch: 8},  // RE
            {wch: 25}, // Militar
            {wch: 15}, // Posto/Grad
            {wch: 15}, // OPM
            {wch: 20}, // Estação
            {wch: 25}, // Composição
            {wch: 12}, // Data
            {wch: 12}, // Horário Início
            {wch: 12}, // Horário Término
            {wch: 10}, // ID
            {wch: 6}   // Mês
        ];
        ws['!cols'] = wscols;
        
        // Criar workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Escalas');
        
        // Gerar nome do arquivo
        const today = new Date().toISOString().split('T')[0];
        const fileName = `escalas_${today}.xlsx`;
        
        // Salvar arquivo
        XLSX.writeFile(wb, fileName);
        
        showMessage(`Arquivo ${fileName} gerado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

// Funções de notificação
function showMessage(message, type = 'info') {
    // Criar alerta temporário
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Remover após 3 segundos
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3000);
}

function showError(message) {
    showMessage(message, 'danger');
}