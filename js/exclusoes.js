import { database } from './firebase-config.js';
import { checkAuth } from './auth-check.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// ==================== VARIÁVEIS GLOBAIS ====================
let allExclusoes = [];
let filteredExclusoes = [];
let currentPage = 1;
const itemsPerPage = 15;
let uniqueStations = new Set();
let uniqueYears = new Set();
let uniqueMonths = new Set();
let uniqueDays = new Set();
let currentSearchType = 'RE';
let userNivel = 3;
let userRE = '';

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================
export async function initExclusoesSPA() {
    // console.log('🚫 Exclusões SPA inicializando...');
    await initializeApp();
}

async function initExclusoes() {
    // console.log('🚫 Página de Exclusões carregando (independente)...');
    await initializeApp();
}

async function initializeApp() {
    try {
        // Verificar autenticação - nível mínimo 2
        const { userData, re } = await checkAuth(2);
        
        userRE = re;
        userNivel = userData.nivel || 3;
        
        sessionStorage.setItem('userRE', userRE);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userNivel', userNivel);
        sessionStorage.setItem('currentUserLevel', userNivel); // ✅ ADICIONAR
        
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        setupEventListeners();
        await loadExclusoes();
        populateFilters();
        applyFilters();
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        
        // ✅ IMPORTANTE: NÃO mostrar erro se for apenas nível insuficiente
        // O usuário já foi redirecionado e viu o alert
        if (!error.message.includes('Nível insuficiente')) {
            showError('Erro ao carregar: ' + error.message);
        }
        // Não faz nada mais - já foi redirecionado
    }
}

// ==================== FUNÇÕES DE CARREGAMENTO DE DADOS ====================
async function loadExclusoes() {
    try {
        showLoading(true);
        
        const escaladosRef = ref(database, 'escalados');
        const snapshot = await get(escaladosRef);
        
        if (snapshot.exists()) {
            allExclusoes = [];
            uniqueStations.clear();
            uniqueYears.clear();
            uniqueMonths.clear();
            uniqueDays.clear();
            
            let totalExclusoesEncontradas = 0;
            
            snapshot.forEach((yearSnapshot) => {
                const year = yearSnapshot.key;
                if (isNaN(year)) return;
                
                yearSnapshot.forEach((monthSnapshot) => {
                    const month = monthSnapshot.key;
                    
                    monthSnapshot.forEach((daySnapshot) => {
                        const day = daySnapshot.key;
                        
                        daySnapshot.forEach((escalaSnapshot) => {
                            const escalaKey = escalaSnapshot.key;
                            const escalaData = escalaSnapshot.val();
                            
                            // FILTRAR APENAS EXCLUSÕES (Exclusao === "X")
                            if (escalaData.Exclusao === "X" || escalaData.Exclusao === "x") {
                                totalExclusoesEncontradas++;
                                processarExclusao(escalaData, year, month, day, escalaKey);
                            }
                        });
                    });
                });
            });
            
            // Ordenar por data (mais recente primeiro)
            allExclusoes.sort((a, b) => {
                const dateA = new Date(a.ano, a.mês - 1, a.dia);
                const dateB = new Date(b.ano, b.mês - 1, b.dia);
                return dateB - dateA;
            });
            
            // console.log(`✅ ${allExclusoes.length} exclusões carregadas`);
            
        } else {
            console.log('📭 Nenhuma exclusão encontrada');
            allExclusoes = [];
            showMessage('Nenhuma exclusão registrada no sistema.', 'info');
        }
        
    } catch (error) {
        console.error('💥 Erro ao carregar exclusões:', error);
        showError('Erro ao carregar exclusões: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function processarExclusao(escalaData, year, month, day, escalaKey) {
    const exclusao = {
        ...escalaData,
        escalaKey: escalaKey,
        ano: parseInt(year),
        mês: parseInt(month),
        dia: parseInt(day),
        Data: `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`,
        Id: escalaData.Id || '',
        RE: escalaData.RE || '',
        linhaId: `${year}/${month}/${day}/${escalaKey}`
    };
    
    // Converter horários
    if (escalaData.HorarioInic !== undefined) {
        exclusao.horarioInicio = decimalToTime(escalaData.HorarioInic);
    }
    if (escalaData.HorarioTerm !== undefined) {
        exclusao.horarioTermino = decimalToTime(escalaData.HorarioTerm);
    }
    exclusao.horarioFormatado = `${exclusao.horarioInicio || '--:--'} às ${exclusao.horarioTermino || '--:--'}`;
    
    // Corrigir PostoGrad
    exclusao.PostoGrad = escalaData.PostoGrad || escalaData.Posto_Grad || '-';
    
    // Campo Documento
    exclusao.Documento = escalaData.Documento || '';
    
    // Adicionar aos conjuntos únicos
    uniqueYears.add(parseInt(year));
    uniqueMonths.add(parseInt(month));
    uniqueDays.add(parseInt(day));
    
    if (escalaData.Estacao) {
        uniqueStations.add(escalaData.Estacao);
    }
    
    allExclusoes.push(exclusao);
}

// ==================== FUNÇÕES DE UTILIDADE ====================
function decimalToTime(decimal) {
    if (decimal === undefined || decimal === null) return '--:--';
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const [day, month, year] = dateString.split('/').map(Number);
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    } catch {
        return dateString;
    }
}

function getMonthName(monthNumber) {
    if (!monthNumber) return '';
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return monthNames[monthNumber - 1] || monthNumber;
}

function getComposicaoColor(composicao) {
    if (!composicao) return 'bg-secondary';
    
    const composicaoUpper = composicao.toUpperCase();
    
    if (composicaoUpper.includes('INCÊNDIO') || composicaoUpper.includes('RESGATE')) {
        return 'bg-danger';
    } else if (composicaoUpper.includes('SALVAMENTO')) {
        return 'bg-success';
    } else if (composicaoUpper.includes('GUARNIÇÃO')) {
        return 'bg-warning';
    } else if (composicaoUpper.includes('SOCORRO')) {
        return 'bg-info';
    } else if (composicaoUpper.includes('EMERGÊNCIA')) {
        return 'bg-primary';
    }
    
    return 'bg-secondary';
}

function getEscalaLink(escalaId) {
    if (!escalaId) return '#';
    return `http://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${escalaId}`;
}

// ==================== FUNÇÕES DE TABELA ====================
function renderTable() {
    const tbody = document.getElementById('exclusoesBody');
    const noDataDiv = document.getElementById('noData');
    const infoText = document.getElementById('infoText');
    const pagination = document.getElementById('pagination');
    
    if (!tbody || !noDataDiv || !infoText || !pagination) {
        console.error('❌ Elementos da tabela não encontrados');
        return;
    }
    
    if (filteredExclusoes.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        infoText.textContent = 'Mostrando 0 de 0 registros';
        pagination.innerHTML = '';
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    const totalPages = Math.ceil(filteredExclusoes.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredExclusoes.length);
    const pageExclusoes = filteredExclusoes.slice(startIndex, endIndex);
    
    let html = '';
    
    // Agrupar exclusões por ID para contar e destacar
    const exclusoesPorId = {};
    filteredExclusoes.forEach(exclusao => {
        if (exclusao.Id) {
            if (!exclusoesPorId[exclusao.Id]) {
                exclusoesPorId[exclusao.Id] = [];
            }
            exclusoesPorId[exclusao.Id].push(exclusao);
        }
    });
    
    pageExclusoes.forEach((exclusao, index) => {
        const globalIndex = startIndex + index + 1;
        
        // Contar quantos tem mesmo ID
        const countSameId = exclusao.Id ? (exclusoesPorId[exclusao.Id] || []).length : 0;
        
        // Cor de fundo para grupo de mesma ID
        let rowClass = '';
        if (countSameId > 1) {
            const idNum = parseInt(exclusao.Id) || 0;
            rowClass += idNum % 2 === 0 ? 'escala-grupo-par ' : 'escala-grupo-impar ';
        }
        
        // Gerar link para a escala original
        const escalaLink = getEscalaLink(exclusao.Id);

        html += `
            <tr class="${rowClass.trim()}" data-exclusao-id="${exclusao.Id}" data-exclusao-re="${exclusao.RE}">
                <td>
                    <div class="fw-bold">${formatDate(exclusao.Data)}</div>
                    <small class="text-muted">${getMonthName(exclusao.mês)}</small>
                </td>
                <td>${exclusao.horarioFormatado}</td>
                <td>${exclusao.OPM || '-'}</td>
                <td>
                    <span class="badge bg-secondary">${exclusao.Estacao || '-'}</span>
                </td>
                <td>
                    <span class="badge ${getComposicaoColor(exclusao.Composicao)}">
                        ${exclusao.Composicao || '-'}
                    </span>
                </td>
                <td>${exclusao.PostoGrad || '-'}</td>
                <td>
                    <span class="badge bg-dark">${exclusao.RE || '-'}</span>
                </td>
                <td>
                    <div class="fw-bold">${exclusao.Militar || '-'}</div>
                </td>
                <td>
                    <a href="${escalaLink}" target="_blank" class="text-primary fw-bold escala-id-link" title="Abrir escala original no sistema">
                        ${exclusao.Id || '-'}
                    </a>
                    ${countSameId > 1 ? `<span class="badge bg-info ms-1">×${countSameId}</span>` : ''}
                </td>
                <td>
                    <div class="documento-text" title="${exclusao.Documento || 'Sem documento'}" 
                         onclick="this.classList.toggle('expanded')" style="cursor: pointer; max-width: 300px;">
                        ${exclusao.Documento ? 
                            (exclusao.Documento.length > 50 ? 
                                `<span class="short">${exclusao.Documento.substring(0, 50)}...</span>
                                 <span class="full d-none">${exclusao.Documento}</span>` : 
                                exclusao.Documento) : 
                            '-'}
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    infoText.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filteredExclusoes.length} registros`;
    renderPagination(totalPages);
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
    if (page < 1 || page > Math.ceil(filteredExclusoes.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==================== FUNÇÕES DE FILTROS ====================
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (currentSearchType === 'RE') {
                this.value = this.value.replace(/\D/g, '').slice(0, 6);
            }
            applyFilters();
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') applyFilters();
        });
    }
    
    // Search type
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) {
        searchTypeSelect.addEventListener('change', function() {
            currentSearchType = this.value;
            const searchInput = document.getElementById('searchRE');
            if (searchInput) {
                searchInput.placeholder = `Buscar por ${getSearchPlaceholder(currentSearchType)}`;
                searchInput.value = '';
                applyFilters();
            }
        });
    }
    
    // Filtros
    const dayFilter = document.getElementById('filterDay');
    if (dayFilter) dayFilter.addEventListener('change', applyFilters);
    
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) monthFilter.addEventListener('change', applyFilters);
    
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter) yearFilter.addEventListener('change', applyFilters);
    
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) stationFilter.addEventListener('change', applyFilters);
    
    // Botões
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshExclusoes);
    
    const exportBtn = document.getElementById('exportExcel');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
}

function getSearchPlaceholder(type) {
    const placeholders = {
        'RE': 'RE (6 dígitos)',
        'Militar': 'Nome do militar',
        'Estacao': 'Estação',
        'Composicao': 'Composição',
        'ID': 'ID da escala',
        'Documento': 'Texto do documento'
    };
    return placeholders[type] || 'Buscar...';
}

function populateFilters() {
    // Filtro de dias (1-31)
    const dayFilter = document.getElementById('filterDay');
    if (dayFilter) {
        while (dayFilter.options.length > 1) {
            dayFilter.remove(1);
        }
        
        for (let day = 1; day <= 31; day++) {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day.toString().padStart(2, '0');
            dayFilter.appendChild(option);
        }
    }
    
    // Filtro de meses
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter && uniqueMonths.size > 0) {
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        const sortedMonths = Array.from(uniqueMonths).sort((a, b) => a - b);
        
        while (monthFilter.options.length > 1) {
            monthFilter.remove(1);
        }
        
        sortedMonths.forEach(month => {
            if (month >= 1 && month <= 12) {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = monthNames[month - 1];
                monthFilter.appendChild(option);
            }
        });
    }
    
    // Filtro de anos
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter && uniqueYears.size > 0) {
        const sortedYears = Array.from(uniqueYears).sort((a, b) => b - a);
        
        while (yearFilter.options.length > 1) {
            yearFilter.remove(1);
        }
        
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }
    
    // Filtro de estações
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter && uniqueStations.size > 0) {
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
    const searchValue = document.getElementById('searchRE').value.trim();
    const dayFilter = document.getElementById('filterDay').value;
    const monthFilter = document.getElementById('filterMonth').value;
    const yearFilter = document.getElementById('filterYear').value;
    const stationFilter = document.getElementById('filterStation').value;
    
    filteredExclusoes = allExclusoes.filter(exclusao => {
        // Filtro de busca
        if (searchValue) {
            const searchField = currentSearchType.toLowerCase();
            let fieldValue = '';
            
            switch(currentSearchType) {
                case 'RE':
                    fieldValue = exclusao.RE ? exclusao.RE.toString() : '';
                    break;
                case 'Militar':
                    fieldValue = exclusao.Militar || '';
                    break;
                case 'Estacao':
                    fieldValue = exclusao.Estacao || '';
                    break;
                case 'Composicao':
                    fieldValue = exclusao.Composicao || '';
                    break;
                case 'ID':
                    fieldValue = exclusao.Id ? exclusao.Id.toString() : '';
                    break;
                case 'Documento':
                    fieldValue = exclusao.Documento || '';
                    break;
            }
            
            if (!fieldValue.toLowerCase().includes(searchValue.toLowerCase())) {
                return false;
            }
        }
        
        // Filtro de dia
        if (dayFilter && exclusao.dia) {
            if (exclusao.dia.toString() !== dayFilter) {
                return false;
            }
        }
        
        // Filtro de mês
        if (monthFilter && exclusao.mês) {
            if (exclusao.mês.toString() !== monthFilter) {
                return false;
            }
        }
        
        // Filtro de ano
        if (yearFilter && exclusao.ano) {
            if (exclusao.ano.toString() !== yearFilter) {
                return false;
            }
        }
        
        // Filtro de estação
        if (stationFilter && exclusao.Estacao) {
            if (exclusao.Estacao !== stationFilter) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTable();
    updateStatistics();
}

function clearFilters() {
    document.getElementById('searchRE').value = '';
    document.getElementById('filterDay').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterStation').value = '';
    
    currentSearchType = 'RE';
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) searchTypeSelect.value = 'RE';
    
    const searchInput = document.getElementById('searchRE');
    if (searchInput) searchInput.placeholder = 'Buscar...';
    
    filteredExclusoes = [...allExclusoes];
    currentPage = 1;
    renderTable();
    updateStatistics();
    
    showMessage('Filtros limpos com sucesso.', 'success');
}

function refreshExclusoes() {
    console.log('🔄 Atualizando exclusões...');
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) {
        const originalHTML = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        refreshBtn.disabled = true;
        
        loadExclusoes().then(() => {
            populateFilters();
            applyFilters();
        }).finally(() => {
            setTimeout(() => {
                refreshBtn.innerHTML = originalHTML;
                refreshBtn.disabled = false;
                showMessage('Dados atualizados com sucesso', 'success');
            }, 500);
        });
    } else {
        loadExclusoes().then(() => {
            populateFilters();
            applyFilters();
        });
    }
}

function updateStatistics() {
    const totalVagas = document.getElementById('totalVagas');
    const totalEscalas = document.getElementById('totalEscalas');
    const totalMilitares = document.getElementById('totalMilitares');
    const mesAtual = document.getElementById('mesAtual');
    const anoAtual = document.getElementById('anoAtual');
    
    if (!totalVagas || !totalEscalas || !totalMilitares || !mesAtual || !anoAtual) {
        console.error('❌ Elementos de estatísticas não encontrados');
        return;
    }
    
    // 1. Total de Exclusões (registros)
    const vagasCount = countTotalVagas(filteredExclusoes);
    totalVagas.textContent = vagasCount.toLocaleString('pt-BR');
    
    // 2. Total de Escalas com exclusões (IDs únicos)
    const escalasCount = countUniqueEscalaIds(filteredExclusoes);
    totalEscalas.textContent = escalasCount.toLocaleString('pt-BR');
    
    // 3. Total de Militares com exclusões (REs únicos)
    const militaresCount = countUniqueMilitares(filteredExclusoes);
    totalMilitares.textContent = militaresCount.toLocaleString('pt-BR');
    
    // 4. Mês atual (baseado no filtro)
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (monthFilter && monthFilter.value) {
        const monthNum = parseInt(monthFilter.value);
        mesAtual.textContent = monthNames[monthNum - 1] || monthNum;
        mesAtual.title = `Mês: ${monthNames[monthNum - 1] || monthNum}`;
    } else {
        mesAtual.textContent = 'Todos';
        mesAtual.title = 'Todos os meses';
    }
    
    // 5. Ano atual (baseado no filtro)
    if (yearFilter && yearFilter.value) {
        anoAtual.textContent = yearFilter.value;
        anoAtual.title = `Ano: ${yearFilter.value}`;
    } else {
        // Se não tem filtro, mostrar período completo
        const years = Array.from(uniqueYears).sort((a, b) => a - b);
        if (years.length === 1) {
            anoAtual.textContent = years[0];
        } else if (years.length > 1) {
            anoAtual.textContent = `${years[0]}-${years[years.length-1]}`;
        } else {
            anoAtual.textContent = '-';
        }
        anoAtual.title = 'Período completo';
    }
    
    // Adicionar tooltips detalhados
    addStatisticsTooltips(vagasCount, escalasCount, militaresCount);
}

// ==================== FUNÇÕES DE EXPORTAÇÃO ====================
function exportToExcel() {
    try {
        if (filteredExclusoes.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        const wsData = filteredExclusoes.map(exclusao => ({
            'Data': exclusao.Data || '',
            'Horário': exclusao.horarioFormatado || '',
            'OPM': exclusao.OPM || '',
            'Estação': exclusao.Estacao || '',
            'Composição': exclusao.Composicao || '',
            'Posto/Grad': exclusao.PostoGrad || '',
            'RE': exclusao.RE || '',
            'Militar': exclusao.Militar || '',
            'ID': exclusao.Id || '',
            'Documento': exclusao.Documento || '',
            'Mês': exclusao.mês || '',
            'Ano': exclusao.ano || '',
            'Motivo': 'Exclusão'
        }));
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        
        const wscols = [
            {wch: 10}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 20},
            {wch: 12}, {wch: 8}, {wch: 25}, {wch: 10}, {wch: 50},
            {wch: 5}, {wch: 6}, {wch: 10}
        ];
        ws['!cols'] = wscols;
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Exclusões');
        
        const today = new Date().toISOString().split('T')[0];
        const fileName = `exclusoes_${today}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        
        showMessage(`Arquivo ${fileName} gerado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

// ==================== FUNÇÕES DE UI/HELPERS ====================
function showLoading(show) {
    const tbody = document.getElementById('exclusoesBody');
    const noDataDiv = document.getElementById('noData');
    
    if (show) {
        if (tbody) tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 text-muted">Carregando exclusões...</p>
                </td>
            </tr>
        `;
        if (noDataDiv) noDataDiv.classList.add('d-none');
    }
}

function showMessage(message, type = 'info') {
    const existingAlerts = document.querySelectorAll('.temp-alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} temp-alert alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) alertDiv.remove();
    }, 3000);
}

function showError(message) {
    showMessage(message, 'danger');
}

// ==================== FUNÇÕES PARA CÁLCULO DE ESTATÍSTICAS ====================

// Contar IDs únicos (escalas diferentes)
function countUniqueEscalaIds(exclusoes) {
    const uniqueIds = new Set();
    exclusoes.forEach(exclusao => {
        if (exclusao.Id) {
            uniqueIds.add(exclusao.Id.toString());
        }
    });
    return uniqueIds.size;
}

// Contar total de vagas (registros)
function countTotalVagas(exclusoes) {
    return exclusoes.length;
}

// Contar militares únicos (REs diferentes)
function countUniqueMilitares(exclusoes) {
    const uniqueREs = new Set();
    exclusoes.forEach(exclusao => {
        if (exclusao.RE) {
            uniqueREs.add(exclusao.RE.toString());
        }
    });
    return uniqueREs.size;
}

// Contar estações únicas
function countUniqueEstacoes(exclusoes) {
    const stations = new Set();
    exclusoes.forEach(exclusao => {
        if (exclusao.Estacao) {
            stations.add(exclusao.Estacao);
        }
    });
    return stations.size;
}

// Função para adicionar tooltips detalhados
// Função para adicionar tooltips detalhados (ATUALIZADA - sem estações)
function addStatisticsTooltips(vagasCount, escalasCount, militaresCount) {
    const totalVagasElement = document.getElementById('totalVagas');
    const totalEscalasElement = document.getElementById('totalEscalas');
    const totalMilitaresElement = document.getElementById('totalMilitares');
    
    if (totalVagasElement) {
        totalVagasElement.setAttribute('data-bs-toggle', 'tooltip');
        totalVagasElement.setAttribute('data-bs-placement', 'top');
        totalVagasElement.setAttribute('title', 
            `${vagasCount} registros de exclusão no período filtrado`);
    }
    
    if (totalEscalasElement) {
        totalEscalasElement.setAttribute('data-bs-toggle', 'tooltip');
        totalEscalasElement.setAttribute('data-bs-placement', 'top');
        totalEscalasElement.setAttribute('title', 
            `${escalasCount} escalas diferentes com exclusões`);
    }
    
    if (totalMilitaresElement) {
        totalMilitaresElement.setAttribute('data-bs-toggle', 'tooltip');
        totalMilitaresElement.setAttribute('data-bs-placement', 'top');
        totalMilitaresElement.setAttribute('title', 
            `${militaresCount} militares diferentes com exclusões (REs únicos)`);
    }
    
    // Inicializar tooltips do Bootstrap
    if (typeof bootstrap !== 'undefined') {
        setTimeout(() => {
            const tooltipTriggerList = [].slice.call(
                document.querySelectorAll('[data-bs-toggle="tooltip"]')
            );
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                try {
                    return new bootstrap.Tooltip(tooltipTriggerEl);
                } catch (e) {
                    // Ignorar erros de tooltip
                    return null;
                }
            });
        }, 500);
    }
}

// ==================== INICIALIZAÇÃO ====================
// Event listener para quando a página carrega sozinha (não via SPA)
if (!window.location.pathname.includes('app.html')) {
    console.log('📄 exclusoes.html carregando independentemente...');
    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ DOM carregado, iniciando exclusoes...');
        setTimeout(() => {
            if (typeof initExclusoes === 'function') {
                initExclusoes();
            } else {
                console.error('❌ initExclusoes não encontrada como função global');
            }
        }, 100);
    });
}

// Adicionar função global para SPA
window.initExclusoesPage = initExclusoes;