// js/solicitacoes.js - Versão Completa com Cloudinary (LAYOUT ORIGINAL PRESERVADO)
import { checkAuth } from './auth-check.js';
import { auth, database } from './firebase-config.js';
import { 
    ref, get, set, update, push, child, remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { uploadParaCloudinary, gerarNomeArquivoCloudinary } from './cloudinary-config.js';

// Configurações globais
let userDataCache = null;
let userRE = null;
let opmsPermitidas = [];
let opmsNomes = {};
let composicoesDisponiveis = {};
let solicitacoesCache = [];
let opmSelecionada = null;
let mesFiltro = null;
let anoFiltro = null;

// ✅ Constantes do sistema
const BASE_URL_ANEXOS = 'https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/';

// ✅ Variáveis de controle de anexos
let anexosExistentesCache = {};
let usarAnexoExistente = false;
let anexoExistenteSelecionado = null;

// Hierarquia militar para ordenação
const HIERARQUIA_MILITAR = {
    'CORONEL PM': 1,
    'TENENTE CORONEL PM': 2,
    'MAJOR PM': 3,
    'CAPITAO PM': 4,
    '1. TENENTE PM': 5,
    '2. TENENTE PM': 6,
    'SUBTENENTE PM': 7,
    '1. SARGENTO PM': 8,
    '2. SARGENTO PM': 9,
    '3. SARGENTO PM': 10,
    'CABO PM': 11,
    'SOLDADO PM': 12,
    'SOLDADO PM 2. CLASSE': 13
};

// Legendas dos status
function getTooltipStatus(status) {
    switch(status) {
        case 1: return '✅ Aprovado/cadastrado no sistema local';
        case 2: return '⚠️ Exportado/baixado para sistema local';
        case 3: return '❌ Cancelado pelo administrador';
        case 4: return '✋ Em edição pelo usuário';
        case 5: return '🗑️ Marcado para exclusão pelo usuário';
        default: return '📝 Aguardando processamento';
    }
}

// ✅ FUNÇÃO: Gerar ID hierárquico
function gerarIdHierarquico(data, opm, composicao, horario) {
    try {
        const dataObj = new Date(data);
        const ano = dataObj.getFullYear();
        const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
        const dia = String(dataObj.getDate()).padStart(2, '0');
        
        const [hora, minuto] = horario.split(':');
        
        return `${ano}/${mes}/${opm}/${composicao}/${dia}${hora}${minuto}`;
    } catch (error) {
        console.error('Erro ao gerar ID hierárquico:', error);
        throw error;
    }
}

// ✅ FUNÇÃO: Converter ID antigo para novo formato
function converterIdAntigoParaNovo(idAntigo) {
    try {
        const opm = idAntigo.substring(0, 9);
        let restante = idAntigo.substring(9);
        
        let i = 0;
        while (i < restante.length && !/^[2-9]/.test(restante[i])) {
            i++;
        }
        
        const composicao = restante.substring(0, i);
        const dataHora = restante.substring(i);
        
        const ano = dataHora.substring(0, 4);
        const mes = dataHora.substring(4, 6);
        const dia = dataHora.substring(6, 8);
        const hora = dataHora.substring(8, 10);
        const minuto = dataHora.substring(10, 12);
        
        return `${ano}/${mes}/${opm}/${composicao}/${dia}${hora}${minuto}`;
    } catch (error) {
        console.warn('Erro ao converter ID antigo:', idAntigo, error);
        return null;
    }
}

// Exportar funções para SPA
export async function initSolicitacoesSPA() {
    console.log('🚀 Solicitações inicializando (SPA)...');
    await initSolicitacoes();
}

export async function initSolicitacoes() {
    try {
        const { userData, re } = await checkAuth(2);
        userDataCache = userData;
        userRE = re;
        
        let opmParam = null, mesParam = null, anoParam = null;

        if (window.app && window.app.spaParams) {
            opmParam = window.app.spaParams.opm;
            mesParam = window.app.spaParams.mes;
            anoParam = window.app.spaParams.ano;
        } else if (window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            opmParam = urlParams.get('opm');
            mesParam = urlParams.get('mes');
            anoParam = urlParams.get('ano');
        }

        if (opmParam) opmSelecionada = opmParam;
        if (mesParam) mesFiltro = parseInt(mesParam);
        if (anoParam) anoFiltro = parseInt(anoParam);
        
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userLevel', userData.nivel);
        
        if (window.updateUserGreetingInSPA) window.updateUserGreetingInSPA();
        if (window.updateNavbarByLevel) window.updateNavbarByLevel(userData.nivel);
        
        await carregarDadosIniciais();
        
        renderInterface();
        
        console.log('✅ Sistema de Solicitações carregado');
        
    } catch (error) {
        console.error('❌ Erro nas solicitações:', error);
        showSolicitacoesError(error);
    }
}

// Carregar dados iniciais
async function carregarDadosIniciais() {
    try {
        if (userDataCache.nivel === 1) {
            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);
            
            if (localSnapshot.exists()) {
                opmsPermitidas = Object.keys(localSnapshot.val());
                opmsNomes = localSnapshot.val();
            }
        } else {
            const permissaoRef = ref(database, `efetivo/${userRE}/permissaoOPM`);
            const permissaoSnapshot = await get(permissaoRef);
            
            if (permissaoSnapshot.exists()) {
                opmsPermitidas = Object.keys(permissaoSnapshot.val());
            }
            
            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);
            
            if (localSnapshot.exists()) {
                opmsNomes = localSnapshot.val();
            }
        }
        
        if (opmsPermitidas.length === 0) {
            throw new Error('Nenhuma OPM permitida para seu usuário');
        }
        
        for (const opm of opmsPermitidas) {
            try {
                const opmRef = ref(database, `LocalOPM/${opm}`);
                const opmSnapshot = await get(opmRef);
                
                if (opmSnapshot.exists()) {
                    composicoesDisponiveis[opm] = {};
                    Object.entries(opmSnapshot.val()).forEach(([codigo, dados]) => {
                        composicoesDisponiveis[opm][codigo] = dados;
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Não foi possível carregar composições da OPM ${opm}:`, error);
            }
        }
        
        const hoje = new Date();
        mesFiltro = mesFiltro || hoje.getMonth() + 1;
        anoFiltro = anoFiltro || hoje.getFullYear();
        
        await carregarSolicitacoesMes();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        throw error;
    }
}

// ✅ FUNÇÃO: Carregar solicitações do mês
async function carregarSolicitacoesMes() {
    try {
        solicitacoesCache = [];
        
        if (!opmSelecionada) {
            console.log('⚠️ Nenhuma OPM selecionada');
            const tbody = document.getElementById('tbodySolicitacoes');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" class="text-center py-4 text-muted">
                            <i class="fas fa-hand-pointer fa-2x mb-3"></i><br>
                            Selecione uma OPM para carregar as solicitações
                        </td>
                    </tr>
                `;
            }
            return;
        }
        
        const mesStr = mesFiltro.toString().padStart(2, '0');
        const anoStr = anoFiltro.toString();
        const caminhoBase = `solicitacoes/${anoStr}/${mesStr}/${opmSelecionada}`;
        
        console.log('🔍 Buscando em:', caminhoBase);
        
        try {
            const solicitacoesRef = ref(database, caminhoBase);
            const snapshot = await get(solicitacoesRef);
            
            if (snapshot.exists()) {
                snapshot.forEach((composicaoSnapshot) => {
                    const composicaoCod = composicaoSnapshot.key;
                    
                    if (composicaoCod === 'anexos') return;
                    
                    composicaoSnapshot.forEach((solicitacaoSnapshot) => {
                        const idSolicitacao = solicitacaoSnapshot.key;
                        const dados = solicitacaoSnapshot.val();
                        
                        if (!idSolicitacao || !/^\d{6}$/.test(idSolicitacao)) return;
                        
                        const dataInfo = extrairDataDoIdHierarquico(anoStr, mesStr, idSolicitacao);
                        
                        if (dataInfo) {
                            const idCompleto = `${anoStr}/${mesStr}/${opmSelecionada}/${composicaoCod}/${idSolicitacao}`;
                            
                            solicitacoesCache.push({
                                id: idCompleto,
                                id_simplificado: idSolicitacao,
                                ...dados,
                                opm_codigo: opmSelecionada,
                                opm_nome: opmsNomes[opmSelecionada] || opmSelecionada,
                                composicao_cod: composicaoCod,
                                data_extraida: dataInfo.data,
                                data_local: dataInfo.data_local
                            });
                        }
                    });
                });
            }
            
        } catch (error) {
            console.error('❌ Erro na busca:', error);
            await carregarSolicitacoesMesFallback();
        }
        
        const solicitacoesUnicas = [];
        const idsVistos = new Set();
        
        solicitacoesCache.forEach(s => {
            if (!idsVistos.has(s.id) && s.data && s.id_simplificado && /^\d{6}$/.test(s.id_simplificado)) {
                idsVistos.add(s.id);
                solicitacoesUnicas.push(s);
            }
        });
        
        solicitacoesCache = solicitacoesUnicas;
        
        solicitacoesCache.sort((a, b) => {
            try {
                let dataA, dataB;
                
                if (a.data_local) dataA = a.data_local;
                else if (a.data_extraida) dataA = new Date(a.data_extraida);
                else dataA = new Date(a.data);
                
                if (b.data_local) dataB = b.data_local;
                else if (b.data_extraida) dataB = new Date(b.data_extraida);
                else dataB = new Date(b.data);
                
                dataA = new Date(dataA.getTime() - (dataA.getTimezoneOffset() * 60000));
                dataB = new Date(dataB.getTime() - (dataB.getTimezoneOffset() * 60000));
                
                if (isNaN(dataA.getTime()) || isNaN(dataB.getTime())) return 0;
                
                if (dataA.getTime() === dataB.getTime() && a.horario_inicial && b.horario_inicial) {
                    return a.horario_inicial.localeCompare(b.horario_inicial);
                }
                
                return dataA - dataB;
            } catch {
                return 0;
            }
        });
        
    } catch (error) {
        console.error('Erro ao carregar solicitações:', error);
    }
}

// ✅ FUNÇÃO: Extrair data do ID hierárquico
function extrairDataDoIdHierarquico(ano, mes, diaHoraMinuto) {
    try {
        if (!diaHoraMinuto || diaHoraMinuto.length !== 6) return null;
        
        const dia = diaHoraMinuto.substring(0, 2);
        const hora = diaHoraMinuto.substring(2, 4);
        const minuto = diaHoraMinuto.substring(4, 6);
        
        const diaInt = parseInt(dia);
        const horaInt = parseInt(hora);
        const minutoInt = parseInt(minuto);
        const anoInt = parseInt(ano);
        const mesInt = parseInt(mes);
        
        if (isNaN(diaInt) || isNaN(horaInt) || isNaN(minutoInt) || isNaN(anoInt) || isNaN(mesInt)) return null;
        
        const dataLocal = new Date(anoInt, mesInt - 1, diaInt, horaInt, minutoInt, 0, 0);
        
        if (isNaN(dataLocal.getTime())) return null;
        
        const dataStr = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
        
        return {
            data: dataStr,
            data_completa: `${dataStr} ${hora}:${minuto}`,
            data_local: dataLocal,
            ano: anoInt,
            mes: mesInt,
            dia: diaInt,
            hora: horaInt,
            minuto: minutoInt
        };
    } catch (error) {
        return null;
    }
}

// ✅ FUNÇÃO: Fallback para estrutura antiga
async function carregarSolicitacoesMesFallback() {
    console.log('🔄 Usando fallback para estrutura antiga...');
    
    try {
        const solicitacoesRef = ref(database, 'solicitacoes');
        const snapshot = await get(solicitacoesRef);
        
        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([id, dados]) => {
                try {
                    const idOpm = id.substring(0, 9);
                    
                    if (idOpm === opmSelecionada) {
                        const idNovo = converterIdAntigoParaNovo(id);
                        
                        if (idNovo) {
                            const partes = idNovo.split('/');
                            const anoParte = partes[0];
                            const mesParte = partes[1];
                            
                            if (parseInt(mesParte) === mesFiltro && parseInt(anoParte) === anoFiltro) {
                                const dataInfo = extrairDataDoIdHierarquico(anoParte, mesParte, partes[4]);
                                
                                if (dataInfo) {
                                    solicitacoesCache.push({
                                        id: idNovo,
                                        id_antigo: id,
                                        ...dados,
                                        opm_codigo: opmSelecionada,
                                        opm_nome: opmsNomes[opmSelecionada] || opmSelecionada,
                                        data_extraida: dataInfo.data,
                                        data_local: dataInfo.data_local
                                    });
                                    
                                    migrarParaNovaEstrutura(id, dados, idNovo);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao processar solicitação ${id}:`, error);
                }
            });
        }
    } catch (error) {
        console.error('Erro no fallback:', error);
    }
}

// ✅ FUNÇÃO: Migrar para nova estrutura
async function migrarParaNovaEstrutura(idAntigo, dados, idNovo) {
    try {
        console.log(`🔄 Migrando ${idAntigo} → ${idNovo}`);
        
        const novaRef = ref(database, `solicitacoes/${idNovo}`);
        await set(novaRef, dados);
        
        console.log(`✅ Migração concluída: ${idAntigo}`);
    } catch (error) {
        console.error(`❌ Erro na migração de ${idAntigo}:`, error);
    }
}

// ✅ FUNÇÃO: Carregar notificações do nó SolicPendentes
export async function carregarNotificacoesAdmin() {
    try {
        const userLevel = sessionStorage.getItem('userLevel');
        if (userLevel !== '1') return;
        
        const listaNotificacoes = document.getElementById('lista-notificacoes');
        if (!listaNotificacoes) return;
        
        listaNotificacoes.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-warning"></div>
                <p class="small text-muted mt-2">Buscando pendências...</p>
            </div>
        `;
        
        const pendentesRef = ref(database, 'SolicPendentes');
        const snapshot = await get(pendentesRef);
        
        const opmsComPendencias = [];
        const nomesMes = {
            '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
            '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
            '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
        };
        
        if (snapshot.exists()) {
            snapshot.forEach((opmSnapshot) => {
                const opmCodigo = opmSnapshot.key;
                
                opmSnapshot.forEach((mesSnapshot) => {
                    const anoMes = mesSnapshot.key;
                    const dadosPendencia = mesSnapshot.val();
                    
                    const tituloOPM = dadosPendencia.tituloOPM || opmsNomes[opmCodigo] || opmCodigo;
                    const ano = anoMes.substring(0, 4);
                    const mes = anoMes.substring(4, 6);
                    const nomeMes = nomesMes[mes] || `mês ${mes}`;
                    
                    opmsComPendencias.push({
                        codigo: opmCodigo,
                        titulo: tituloOPM,
                        ano: parseInt(ano),
                        mes: parseInt(mes),
                        mesFormatado: nomeMes,
                        anoMes: anoMes,
                        pendentes: dadosPendencia.total || 1,
                        path: `SolicPendentes/${opmCodigo}/${anoMes}`
                    });
                });
            });
        }
        
        opmsComPendencias.sort((a, b) => {
            if (a.codigo !== b.codigo) return a.codigo.localeCompare(b.codigo);
            return b.anoMes.localeCompare(a.anoMes);
        });
        
        if (opmsComPendencias.length === 0) {
            listaNotificacoes.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-check-circle text-success fa-2x mb-2"></i>
                    <p class="small text-muted">Nenhuma pendência encontrada</p>
                    <p class="small text-muted mt-1">Todas as solicitações estão processadas</p>
                </div>
            `;
        } else {
            let html = '';
            opmsComPendencias.forEach((opm, index) => {
                const isUltima = index === opmsComPendencias.length - 1;
                const tituloFormatado = `${opm.titulo} - ${opm.mesFormatado} de ${opm.ano}`;
                
                html += `
                    <div class="dropdown-item notificacao-item py-2 px-3 border-bottom" data-opm="${opm.codigo}" data-ano="${opm.ano}" data-mes="${opm.mes}">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1" style="cursor: pointer;" onclick="window.aplicarFiltrosSolicitacoes('${opm.codigo}', ${opm.mes}, ${opm.ano})">
                                <strong class="d-block">${tituloFormatado}</strong>
                                <small class="text-muted">${opm.pendentes} pendência(s)</small>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-outline-danger rounded-circle excluir-pendencia" 
                                        data-path="${opm.path}"
                                        data-titulo="${tituloFormatado}"
                                        title="Marcar como resolvida"
                                        style="width: 32px; height: 32px; padding: 0;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${!isUltima ? '<div class="dropdown-divider my-0"></div>' : ''}
                `;
            });
            listaNotificacoes.innerHTML = html;
            
            document.querySelectorAll('.excluir-pendencia').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const path = btn.dataset.path;
                    const titulo = btn.dataset.titulo;
                    
                    if (confirm(`🗑️ Confirmar que a pendência "${titulo}" foi resolvida?\nEsta ação não pode ser desfeita.`)) {
                        await excluirPendencia(path);
                    }
                });
            });
        }
        
        if (window.atualizarBadgeNotificacoes) {
            window.atualizarBadgeNotificacoes(opmsComPendencias.length);
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar notificações:', error);
        const listaNotificacoes = document.getElementById('lista-notificacoes');
        if (listaNotificacoes) {
            listaNotificacoes.innerHTML = `
                <div class="text-center py-3">
                    <i class="fas fa-exclamation-triangle text-danger fa-2x mb-2"></i>
                    <p class="small text-danger">Erro ao carregar notificações</p>
                    <p class="small text-muted">${error.message}</p>
                </div>
            `;
        }
    }
}

// ✅ FUNÇÃO: Excluir pendência
async function excluirPendencia(path) {
    try {
        const btn = event?.target?.closest('.excluir-pendencia');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        const pendenteRef = ref(database, path);
        await remove(pendenteRef);
        
        console.log(`✅ Pendência removida: ${path}`);
        
        await carregarNotificacoesAdmin();
        
        const mensagensDiv = document.getElementById('mensagensForm');
        if (mensagensDiv) {
            mensagensDiv.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show">
                    ✅ Pendência marcada como resolvida!
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
            setTimeout(() => {
                const alert = mensagensDiv.querySelector('.alert');
                if (alert) alert.remove();
            }, 3000);
        }
        
    } catch (error) {
        console.error('❌ Erro ao excluir pendência:', error);
        alert('Erro ao excluir pendência: ' + error.message);
    }
}

// ✅ FUNÇÃO: Extrair data sem fuso
function extrairDataSemFuso(dataStr) {
    if (!dataStr) return null;
    
    let ano, mes, dia;
    
    if (dataStr.includes('-')) {
        const partes = dataStr.split('-');
        if (partes.length >= 3) {
            ano = parseInt(partes[0]);
            mes = partes[1].padStart(2, '0');
            dia = partes[2].substring(0, 2).padStart(2, '0');
        }
    } else if (dataStr.includes('/')) {
        const partes = dataStr.split('/');
        if (partes.length >= 3) {
            dia = partes[0].padStart(2, '0');
            mes = partes[1].padStart(2, '0');
            ano = parseInt(partes[2]);
        }
    } else if (dataStr.includes('-') && dataStr.split('-')[0].length <= 2) {
        const partes = dataStr.split('-');
        if (partes.length >= 3) {
            dia = partes[0].padStart(2, '0');
            mes = partes[1].padStart(2, '0');
            ano = parseInt(partes[2]);
        }
    }
    
    if (ano && ano < 100) ano = 2000 + ano;
    
    if (ano && mes && dia) {
        return { ano, mes, dia };
    }
    
    return null;
}

// ✅ FUNÇÃO: Verificar anexos existentes (MODIFICADA - retorna URLs)
async function verificarAnexosExistentes(ano, mes, opmCodigo, composicaoCod) {
    const cacheKey = `${ano}-${mes}-${opmCodigo}-${composicaoCod}`;
    
    if (anexosExistentesCache[cacheKey]) {
        return anexosExistentesCache[cacheKey];
    }
    
    try {
        const caminhoAnexos = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos`;
        const anexosRef = ref(database, caminhoAnexos);
        const snapshot = await get(anexosRef);
        
        const anexos = [];
        let proximoNumero = 1;
        
        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([numeroAnexo, dadosAnexo]) => {
                if (/^\d{2}$/.test(numeroAnexo)) {
                    anexos.push({
                        numero: numeroAnexo,
                        url: dadosAnexo.url,
                        nome_sistema: dadosAnexo.nome_sistema,
                        upload_por_re: dadosAnexo.upload_por_re,
                        upload_por_nome: dadosAnexo.upload_por_nome,
                        upload_em: dadosAnexo.upload_em
                    });
                    
                    const num = parseInt(numeroAnexo);
                    if (num >= proximoNumero) proximoNumero = num + 1;
                }
            });
            
            anexos.sort((a, b) => parseInt(a.numero) - parseInt(b.numero));
        }
        
        anexosExistentesCache[cacheKey] = {
            anexos: anexos,
            proximoNumero: proximoNumero.toString().padStart(2, '0'),
            temAnexos: anexos.length > 0
        };
        
        console.log(`📎 Anexos encontrados: ${anexos.length}`);
        return anexosExistentesCache[cacheKey];
        
    } catch (error) {
        console.error('❌ Erro ao verificar anexos:', error);
        return {
            anexos: [],
            proximoNumero: '01',
            temAnexos: false
        };
    }
}

// ✅ FUNÇÃO: Gerar nome do arquivo do anexo
function gerarNomeArquivoAnexo(ano, mes, opmCodigo, composicaoCod, numeroAnexo) {
    return `${ano}${mes}${opmCodigo}${composicaoCod}${numeroAnexo}`;
}

// ✅ FUNÇÃO: Montar lista de anexos disponíveis (MODIFICADA - usa URLs)
function montarListaAnexosDisponiveis(anexosInfo) {
    if (!anexosInfo || anexosInfo.anexos.length === 0) {
        return '<div class="alert alert-info">Nenhum anexo existente para esta OPM/Composição.</div>';
    }
    
    let html = `
        <div class="alert alert-warning">
            <strong><i class="fas fa-info-circle me-2"></i>ATENÇÃO:</strong> 
            Existem ${anexosInfo.anexos.length} anexo(s) cadastrado(s) para esta OPM e Composição.
        </div>
        
        <div class="mb-3">
            <label class="form-label fw-bold">Anexos disponíveis:</label>
            <div class="list-group" style="max-height: 200px; overflow-y: auto;">
    `;
    
    anexosInfo.anexos.forEach((anexo) => {
        html += `
            <div class="list-group-item list-group-item-action">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Anexo ${anexo.numero}</strong>
                        <br>
                        <small class="text-muted">${anexo.nome_sistema}.pdf</small>
                        <br>
                        <small class="text-muted">Por: ${anexo.upload_por_nome}</small>
                    </div>
                    <div>
                        <button type="button" class="btn btn-sm btn-outline-primary btn-visualizar-anexo" 
                                data-url="${anexo.url}"
                                title="Visualizar anexo">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
        
        <div class="mb-3">
            <label class="form-label fw-bold" for="selectAnexoExistente">Anexo de referência:</label>
            <select class="form-select" id="selectAnexoExistente">
                <option value="">Selecione o anexo de referência...</option>
    `;

    anexosInfo.anexos.forEach((anexo) => {
        html += `<option value="${anexo.numero}">Anexo ${anexo.numero} - ${anexo.nome_sistema}.pdf</option>`;
    });

    html += `
            </select>
            <small class="text-muted">Este anexo será gravado como referência em <strong>comprovante_anexo</strong>.</small>
        </div>
        
        <div class="mb-3">
            <label class="form-label fw-bold">A justificativa já consta em algum desses anexos?</label>
            <div class="form-check">
                <input class="form-check-input" type="radio" name="usarAnexoExistente" 
                       id="usarAnexoSim" value="sim" checked>
                <label class="form-check-label" for="usarAnexoSim">
                    <strong class="text-success">Sim</strong> - Usar anexo(s) existente(s)
                </label>
            </div>
            <div class="form-check">
                <input class="form-check-input" type="radio" name="usarAnexoExistente" 
                       id="usarAnexoNao" value="nao">
                <label class="form-check-label" for="usarAnexoNao">
                    <strong class="text-danger">Não</strong> - Anexar novo documento
                </label>
            </div>
        </div>
    `;
    
    return html;
}

// ✅ NOVA FUNÇÃO: Salvar metadados do anexo no Firebase (SEM base64)
async function salvarMetadadosAnexo(ano, mes, opmCodigo, composicaoCod, numeroAnexo, urlCloudinary, nomeSistema, arquivo) {
    try {
        const caminhoAnexo = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos/${numeroAnexo}`;
        const anexoRef = ref(database, caminhoAnexo);
        
        const dadosAnexo = {
            url: urlCloudinary,
            nome_sistema: nomeSistema,
            upload_por_re: userRE,
            upload_por_nome: userDataCache.nome,
            upload_em: new Date().toISOString()
        };
        
        await set(anexoRef, dadosAnexo);
        console.log(`✅ Metadados salvos em: ${caminhoAnexo}`);
        
        const cacheKey = `${ano}-${mes}-${opmCodigo}-${composicaoCod}`;
        if (anexosExistentesCache[cacheKey]) {
            anexosExistentesCache[cacheKey].anexos.push({
                numero: numeroAnexo,
                url: urlCloudinary,
                nome_sistema: nomeSistema,
                upload_por_re: userRE,
                upload_por_nome: userDataCache.nome,
                upload_em: new Date().toISOString()
            });
            anexosExistentesCache[cacheKey].proximoNumero = (parseInt(numeroAnexo) + 1).toString().padStart(2, '0');
        }
        
        return { sucesso: true, numeroAnexo };
        
    } catch (error) {
        console.error('❌ Erro ao salvar metadados:', error);
        throw error;
    }
}

// ✅ FUNÇÃO: Mostrar modal para visualizar anexo (MODIFICADA - usa URL)
function mostrarModalVisualizarAnexo(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

// ✅ FUNÇÃO: Formatar tamanho do arquivo
function formatarTamanhoArquivo(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ✅ FUNÇÃO: Validar arquivo PDF
function validarArquivoPDF(arquivo) {
    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.pdf')) return false;
    
    const tiposPermitidos = ['application/pdf'];
    if (arquivo.type && !tiposPermitidos.includes(arquivo.type)) {
        console.warn('Tipo MIME não reconhecido como PDF:', arquivo.type);
    }
    
    return true;
}

// ✅ FUNÇÃO: Ordenar por posto/grad
function ordenarPorPostoGradCorrigido(militares) {
    return militares.sort((a, b) => {
        const ordemA = HIERARQUIA_MILITAR[a.PostoGrad] || 999;
        const ordemB = HIERARQUIA_MILITAR[b.PostoGrad] || 999;
        
        if (ordemA !== ordemB) return ordemA - ordemB;
        
        const reA = parseInt(a.re) || 999999;
        const reB = parseInt(b.re) || 999999;
        return reA - reB;
    });
}

// ✅ FUNÇÃO: Buscar escalados
async function buscarEscaladosModal(idSistema, dataSolicitacao) {
    try {
        console.log('🔍 Buscando escalados para ID:', idSistema, 'Data:', dataSolicitacao);
        
        const idSistemaStr = String(idSistema || '').trim();
        const dataSolicitacaoStr = String(dataSolicitacao || '').trim();
        
        if (!idSistemaStr || idSistemaStr === '-' || idSistemaStr === 'null' || idSistemaStr === 'undefined') {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, 'ID da escala não informada');
            return;
        }
        
        const idNumerico = idSistemaStr.replace(/\D/g, '');
        
        if (!idNumerico || idNumerico.length < 3) {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, 'ID da escala inválida');
            return;
        }
        
        const dataExtraida = extrairDataSemFuso(dataSolicitacaoStr);
        
        if (!dataExtraida) {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, 
                `Formato de data não reconhecido: "${dataSolicitacaoStr}"`);
            return;
        }
        
        const { ano, mes, dia } = dataExtraida;
        
        const caminhoBase = `escalados/${ano}/${mes}/${dia}`;
        const escaladosRef = ref(database, caminhoBase);
        const snapshot = await get(escaladosRef);
        
        const militaresEncontrados = [];
        
        if (snapshot.exists()) {
            const dados = snapshot.val();
            const chaves = Object.keys(dados);
            
            for (const chaveCompleta of chaves) {
                try {
                    if (chaveCompleta.length < 7) continue;
                    
                    const idNaChave = chaveCompleta.slice(0, -6);
                    
                    if (idNaChave === idNumerico) {
                        const militarData = dados[chaveCompleta];
                        const re = chaveCompleta.slice(-6);
                        
                        militaresEncontrados.push({
                            PostoGrad: militarData.PostoGrad || 'NÃO INFORMADO',
                            re: re,
                            Militar: militarData.Militar || 'NÃO INFORMADO',
                            OPM: militarData.OPM || '',
                            Estacao: militarData.Estacao || '',
                            Composicao: militarData.Composicao || ''
                        });
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao processar chave:', error);
                }
            }
        }
        
        const militaresOrdenados = ordenarPorPostoGradCorrigido(militaresEncontrados);
        
        mostrarModalEscaladosCompleto(militaresOrdenados, dataSolicitacaoStr, idNumerico);
        
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, `Erro: ${error.message}`);
    }
}

// ✅ FUNÇÃO: Mostrar modal de escalados
function mostrarModalEscaladosCompleto(militares, dataSolicitacao, idSistema, erro = null) {
    const modalId = `modalEscalados-${Date.now()}`;
    
    let dataFormatada = dataSolicitacao;
    const dataExtraida = extrairDataSemFuso(dataSolicitacao);
    if (dataExtraida) {
        dataFormatada = `${dataExtraida.dia}/${dataExtraida.mes}/${dataExtraida.ano}`;
    }
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-users me-2"></i>
                            Militares Escalados - ${dataFormatada}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <h6>Militares Escalados</h6>
                            <small class="text-muted">ID da Escala: ${idSistema} | Total de militares: ${militares.length}</small>
                        </div>
                        
                        ${erro ? `
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Erro:</strong> ${erro}
                        </div>
                        ` : ''}
                        
                        ${militares.length > 0 ? `
                        <div class="table-responsive mt-3">
                            <table class="table table-sm table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th width="50" class="text-center">#</th>
                                        <th>POSTO/GRAD</th>
                                        <th width="100" class="text-center">RE</th>
                                        <th>MILITAR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${militares.map((militar, index) => `
                                        <tr>
                                            <td class="text-center align-middle">${index + 1}</td>
                                            <td class="align-middle">
                                                <span class="badge bg-secondary">${militar.PostoGrad}</span>
                                            </td>
                                            <td class="text-center align-middle">
                                                <code class="fw-bold">${militar.re}</code>
                                            </td>
                                            <td class="align-middle">${militar.Militar}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <div class="mt-4 pt-3 border-top text-center">
                            <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${idSistema}" 
                               target="_blank" 
                               class="btn btn-primary">
                                <i class="fas fa-external-link-alt me-2"></i>
                                Abrir Escala no Sistema
                            </a>
                        </div>
                        ` : `
                        <div class="text-center py-4">
                            <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">Nenhum militar escalado encontrado</h5>
                            <p class="text-muted">
                                ID: <code>${idSistema}</code> | Data: ${dataFormatada}<br>
                                Esta escala não possui militares registrados no sistema.
                            </p>
                            
                            <div class="mt-4">
                                <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${idSistema}" 
                                   target="_blank" 
                                   class="btn btn-outline-primary">
                                    <i class="fas fa-external-link-alt me-2"></i>
                                    Ver Escala no Sistema
                                </a>
                            </div>
                        </div>
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        modalElement.addEventListener('hidden.bs.modal', () => {
            setTimeout(() => {
                if (modalContainer.parentNode) {
                    modalContainer.parentNode.removeChild(modalContainer);
                }
            }, 300);
        });
    }
}

// ✅ FUNÇÃO: Atualizar campo anexo (MODIFICADA - usa URLs)
async function atualizarCampoAnexo(prioridade) {
    const divAnexo = document.getElementById('divAnexo');
    const labelAnexo = document.getElementById('labelAnexo');
    const textoAjuda = document.getElementById('textoAjudaAnexo');
    const inputAnexo = document.getElementById('inputAnexo');
    
    if (!divAnexo || !labelAnexo || !textoAjuda || !inputAnexo) return;
    
    divAnexo.style.display = 'none';
    
    let divAnexosExistentes = document.getElementById('divAnexosExistentes');
    if (divAnexosExistentes) {
        divAnexosExistentes.style.display = 'none';
        divAnexosExistentes.innerHTML = '';
    }
    
    inputAnexo.value = '';
    inputAnexo.required = false;
    inputAnexo.removeAttribute('required');
    usarAnexoExistente = false;
    anexoExistenteSelecionado = null;

    if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
        divAnexo.style.display = 'block';
        
        if (prioridade === 'minimo_operacional') {
            labelAnexo.textContent = 'EB - Escala Operacional';
            textoAjuda.textContent = 'Anexe o documento EB - Escala Operacional';
        } else {
            labelAnexo.textContent = 'SAT - Relatório de Vistorias Atrasadas';
            textoAjuda.textContent = 'Anexe o relatório SAT de vistorias atrasadas';
        }
        
        textoAjuda.className = 'text-muted';
        
        const opmSelecionada = document.getElementById('selectOpm')?.value;
        const composicaoSelecionada = document.getElementById('selectComposicao')?.value;
        const dataSelecionada = document.getElementById('inputData')?.value;
        
        if (opmSelecionada && composicaoSelecionada && dataSelecionada) {
            const [diaStr, mesStr, anoStr] = dataSelecionada.split('/');
            const ano = anoStr;
            const mes = mesStr.padStart(2, '0');
            
            const anexosInfo = await verificarAnexosExistentes(ano, mes, opmSelecionada, composicaoSelecionada);
            
            if (anexosInfo.temAnexos) {
                divAnexosExistentes = document.getElementById('divAnexosExistentes');
                
                if (!divAnexosExistentes) {
                    divAnexosExistentes = document.createElement('div');
                    divAnexosExistentes.id = 'divAnexosExistentes';
                    divAnexo.parentNode.insertBefore(divAnexosExistentes, divAnexo);
                }
                
                const listaHTML = montarListaAnexosDisponiveis(anexosInfo);
                divAnexosExistentes.innerHTML = listaHTML;
                divAnexosExistentes.style.display = 'block';
                
                setTimeout(() => {
                    document.querySelectorAll('.btn-visualizar-anexo').forEach(btn => {
                        btn.addEventListener('click', () => {
                            mostrarModalVisualizarAnexo(btn.dataset.url);
                        });
                    });
                    
                    const selectAnexoExistente = document.getElementById('selectAnexoExistente');
                    if (selectAnexoExistente) {
                        selectAnexoExistente.addEventListener('change', (e) => {
                            anexoExistenteSelecionado = e.target.value || null;
                        });
                    }

                    document.querySelectorAll('input[name="usarAnexoExistente"]').forEach(radio => {
                        radio.addEventListener('change', (e) => {
                            usarAnexoExistente = (e.target.value === 'sim');
                            inputAnexo.required = !usarAnexoExistente;
                            
                            if (usarAnexoExistente) {
                                inputAnexo.removeAttribute('required');
                                textoAjuda.innerHTML = `<span class="text-success">✓ Usando anexo existente</span>`;
                                inputAnexo.disabled = true;
                                if (selectAnexoExistente) {
                                    selectAnexoExistente.disabled = false;
                                }
                            } else {
                                inputAnexo.setAttribute('required', 'required');
                                textoAjuda.textContent = prioridade === 'minimo_operacional' 
                                    ? 'Anexe o documento EB - Escala Operacional' 
                                    : 'Anexe o relatório SAT de vistorias atrasadas';
                                inputAnexo.disabled = false;
                                if (selectAnexoExistente) {
                                    selectAnexoExistente.disabled = true;
                                    selectAnexoExistente.value = '';
                                }
                                anexoExistenteSelecionado = null;
                            }
                        });
                    });
                    
                    const radioSim = document.getElementById('usarAnexoSim');
                    if (radioSim) {
                        radioSim.checked = true;
                        usarAnexoExistente = true;
                        inputAnexo.required = false;
                        inputAnexo.disabled = true;
                        textoAjuda.innerHTML = `<span class="text-success">✓ Usando anexo existente</span>`;
                        const primeiroAnexo = anexosInfo.anexos[0];
                        if (selectAnexoExistente && primeiroAnexo) {
                            selectAnexoExistente.disabled = false;
                            selectAnexoExistente.value = primeiroAnexo.numero;
                            anexoExistenteSelecionado = primeiroAnexo.numero;
                        }
                    }
                    
                }, 100);
            } else {
                inputAnexo.required = true;
                inputAnexo.setAttribute('required', 'required');
                inputAnexo.disabled = false;
                usarAnexoExistente = false;
                anexoExistenteSelecionado = null;
            }
        } else {
            inputAnexo.required = true;
            inputAnexo.setAttribute('required', 'required');
            inputAnexo.disabled = false;
            usarAnexoExistente = false;
        }
    }
    
    inputAnexo.setAttribute('data-obrigatorio', 
        (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') ? 'true' : 'false'
    );
}

// ✅ FUNÇÃO: Verificar duplicidade
async function verificarDuplicidade(dados) {
    const diasDuplicados = [];
    
    for (const dia of dados.diasSelecionados) {
        const [ano, mes, resto] = dados.data_base.split('-');
        const diaHoraMinuto = `${dia.toString().padStart(2, '0')}${dados.horario_inicial.replace(/:/g, '')}`;
        const caminho = `${ano}/${mes}/${dados.opm_codigo}/${dados.composicao_cod}/${diaHoraMinuto}`;
        
        const solicitacaoRef = ref(database, `solicitacoes/${caminho}`);
        const snapshot = await get(solicitacaoRef);
        
        if (snapshot.exists()) {
            diasDuplicados.push(dia);
        }
    }
    
    return diasDuplicados;
}

// ✅ FUNÇÃO: Cadastrar nova solicitação (MODIFICADA - upload único)
async function cadastrarSolicitacao() {
    try {
        const btnCadastrar = document.getElementById('btnCadastrar');
        if (!btnCadastrar) return;
        
        const originalText = btnCadastrar.innerHTML;
        btnCadastrar.disabled = true;
        btnCadastrar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Processando...';
        
        const prioridade = document.getElementById('selectPrioridade').value;
        const inputAnexo = document.getElementById('inputAnexo');
        const opmSelecionada = document.getElementById('selectOpm').value;
        const composicaoSelecionada = document.getElementById('selectComposicao').value;
        const dataSelecionada = document.getElementById('inputData').value;
        
        const [diaStr, mesStr, anoStr] = dataSelecionada.split('/');
        const ano = anoStr;
        const mes = mesStr.padStart(2, '0');
        
        const formData = coletarDadosFormulario();
        
        const validacao = validarDadosFormulario(formData);
        if (!validacao.valido) {
            mostrarMensagemFormulario(validacao.mensagem, 'danger');
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }
        
        const diasDuplicados = await verificarDuplicidade(formData);
        if (diasDuplicados.length > 0) {
            mostrarMensagemFormulario(
                `❌ Os dias ${diasDuplicados.join(', ')} já possuem solicitação cadastrada.`,
                'danger'
            );
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }
        
        let urlAnexo = null;
        let numeroAnexo = null;
        let nomeSistema = null;
        
        if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
            const anexosInfo = await verificarAnexosExistentes(ano, mes, opmSelecionada, composicaoSelecionada);
            
            const radioSim = document.querySelector('input[name="usarAnexoExistente"][value="sim"]');
            const usarAnexoExistenteAtual = radioSim ? radioSim.checked : false;
            
            if (anexosInfo.temAnexos && usarAnexoExistenteAtual) {
                if (!anexoExistenteSelecionado) {
                    mostrarMensagemFormulario('❌ Selecione o anexo de referência da lista de anexos existentes.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }
                numeroAnexo = anexoExistenteSelecionado;
                console.log(`📎 Solicitação cadastrada usando anexo existente de referência: ${numeroAnexo}.`);
            } else {
                if (!inputAnexo || inputAnexo.files.length === 0) {
                    mostrarMensagemFormulario('❌ Selecione um arquivo PDF para anexar.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }
                
                const arquivo = inputAnexo.files[0];
                if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
                    mostrarMensagemFormulario('❌ O arquivo deve ser PDF.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }
                
                const progressBar = document.getElementById('progressAnexo');
                const progressFill = progressBar?.querySelector('.progress-bar');
                if (progressBar) progressBar.style.display = 'block';
                if (progressFill) progressFill.style.width = '30%';
                
                const proximoNumero = anexosInfo.proximoNumero;
                nomeSistema = gerarNomeArquivoCloudinary(ano, mes, opmSelecionada, composicaoSelecionada, proximoNumero);
                
                try {
                    if (progressFill) progressFill.style.width = '60%';
                    
                    const resultado = await uploadParaCloudinary(arquivo, nomeSistema);
                    urlAnexo = resultado.url;
                    numeroAnexo = proximoNumero;
                    
                    if (progressFill) progressFill.style.width = '90%';
                    
                    await salvarMetadadosAnexo(
                        ano, mes, opmSelecionada, composicaoSelecionada,
                        numeroAnexo, urlAnexo, nomeSistema, arquivo
                    );
                    
                    if (progressFill) progressFill.style.width = '100%';
                    setTimeout(() => {
                        if (progressBar) progressBar.style.display = 'none';
                        if (progressFill) progressFill.style.width = '0%';
                    }, 500);
                    
                } catch (uploadError) {
                    console.error('❌ Erro no upload:', uploadError);
                    mostrarMensagemFormulario(`❌ Erro no upload: ${uploadError.message}`, 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    if (progressBar) progressBar.style.display = 'none';
                    return;
                }
            }
        }
        
        let sucessos = 0;
        let erros = [];
        
        for (const dia of formData.diasSelecionados) {
            try {
                await cadastrarDiaSolicitacao(formData, dia, numeroAnexo, urlAnexo, nomeSistema);
                sucessos++;
            } catch (error) {
                erros.push(`Dia ${dia}: ${error.message}`);
            }
        }
        
        if (sucessos > 0) {
            mostrarMensagemFormulario(
                `✅ ${sucessos} solicitação(ões) cadastrada(s) com sucesso!`,
                'success'
            );
            
            limparFormularioSilencioso();
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
        }
        
        if (erros.length > 0) {
            mostrarMensagemFormulario(
                `⚠️ ${erros.length} erro(s):<br>${erros.join('<br>')}`,
                'warning'
            );
        }
        
    } catch (error) {
        console.error('Erro ao cadastrar:', error);
        mostrarMensagemFormulario(`❌ Erro: ${error.message}`, 'danger');
    } finally {
        const btnCadastrar = document.getElementById('btnCadastrar');
        if (btnCadastrar) {
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = '<i class="fas fa-save me-1"></i>Cadastrar';
        }
    }
}

// ✅ FUNÇÃO: Cadastrar um dia específico
async function cadastrarDiaSolicitacao(dados, dia, numeroAnexo, urlAnexo, nomeSistema) {
    const [ano, mes, resto] = dados.data_base.split('-');
    const diaFormatado = dia.toString().padStart(2, '0');
    const horaMinuto = dados.horario_inicial.replace(/:/g, '');
    const diaHoraMinuto = `${diaFormatado}${horaMinuto}`;
    
    const idSolicitacao = `${ano}/${mes}/${dados.opm_codigo}/${dados.composicao_cod}/${diaHoraMinuto}`;
    
    let composicaoNome = '';
    if (composicoesDisponiveis[dados.opm_codigo]?.[dados.composicao_cod]) {
        composicaoNome = composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod].composicao || '';
    }
    
    const dadosSolicitacao = {
        data: `${ano}-${mes}-${diaFormatado}`,
        opm_codigo: dados.opm_codigo,
        opm_nome: dados.opm_nome,
        composicao_cod: dados.composicao_cod,
        composicao_nome: composicaoNome,
        horario_inicial: dados.horario_inicial,
        horario_final: dados.horario_final,
        vagas_subten_sgt: dados.vagas_subten_sgt,
        vagas_cb_sd: dados.vagas_cb_sd,
        prioridade: dados.prioridade,
        motivo: dados.motivo,
        observacoes: dados.observacoes,
        comprovante_anexo: numeroAnexo,
        criado_por_re: userRE,
        criado_por_nome: userDataCache.nome,
        criado_em: new Date().toISOString()
    };
    
    const solicitacaoRef = ref(database, `solicitacoes/${idSolicitacao}`);
    await set(solicitacaoRef, dadosSolicitacao);
    
    await registrarPendenciaSolicitacao(dados.opm_codigo, dados.opm_nome, ano, mes);
    
    const historicoRef = ref(database, `solicitacoes/${idSolicitacao}/historico`);
    const entradaHistorico = criarEntradaHistorico({
        dados_completos: 'Solicitação criada'
    });
    await update(historicoRef, entradaHistorico);
    
    console.log(`✅ Solicitação cadastrada: ${idSolicitacao}`);
}

// ✅ FUNÇÃO: Criar timestamp Firebase
function criarTimestampFirebase() {
    const now = new Date();
    return (
        now.getFullYear() + 
        String(now.getMonth() + 1).padStart(2, '0') + 
        String(now.getDate()).padStart(2, '0') + 
        String(now.getHours()).padStart(2, '0') + 
        String(now.getMinutes()).padStart(2, '0') + 
        String(now.getSeconds()).padStart(2, '0') + 
        String(now.getMilliseconds()).padStart(3, '0')
    );
}

// ✅ FUNÇÃO: Criar entrada de histórico
function criarEntradaHistorico(dados = {}) {
    const timestamp = criarTimestampFirebase();
    return {
        [timestamp]: {
            alterado_por_re: userRE,
            alterado_por_nome: userDataCache.nome,
            ...dados
        }
    };
}

// ✅ FUNÇÃO: Coletar dados do formulário
function coletarDadosFormulario() {
    const dataInput = document.getElementById('inputData');
    if (!dataInput || !dataInput.value) {
        throw new Error('Data é obrigatória');
    }
    
    const [diaStr, mesStr, anoStr] = dataInput.value.split('/');
    const dataBase = `${anoStr}-${mesStr.padStart(2, '0')}-${diaStr.padStart(2, '0')}`;
    const diaSelecionado = parseInt(diaStr);
    
    const diasSelecionados = [diaSelecionado];
    
    const checkboxes = document.querySelectorAll('#divDiasMes input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            const dia = parseInt(cb.value);
            if (dia !== diaSelecionado) {
                diasSelecionados.push(dia);
            }
        }
    });
    
    return {
        opm_codigo: opmSelecionada,
        opm_nome: opmsNomes[opmSelecionada] || opmSelecionada,
        composicao_cod: document.getElementById('selectComposicao').value,
        data_base: dataBase,
        dia_selecionado: diaSelecionado,
        horario_inicial: document.getElementById('inputHorarioInicial').value,
        horario_final: document.getElementById('inputHorarioFinal').value,
        vagas_subten_sgt: parseInt(document.getElementById('inputVagasSubten').value),
        vagas_cb_sd: parseInt(document.getElementById('inputVagasCbSd').value),
        prioridade: document.getElementById('selectPrioridade').value,
        motivo: document.getElementById('inputMotivo')?.value.trim() || '',
        observacoes: document.getElementById('inputObservacoes')?.value.trim() || '',
        diasSelecionados: diasSelecionados
    };
}

// ✅ FUNÇÃO: Validar dados do formulário
function validarDadosFormulario(dados) {
    const radioSim = document.querySelector('input[name="usarAnexoExistente"][value="sim"]');
    const radioNao = document.querySelector('input[name="usarAnexoExistente"][value="nao"]');
    let usuarioEscolheuUsarAnexoExistente = false;
    
    if (radioSim && radioSim.checked) {
        usuarioEscolheuUsarAnexoExistente = true;
    } else if (radioNao && radioNao.checked) {
        usuarioEscolheuUsarAnexoExistente = false;
    } else {
        usuarioEscolheuUsarAnexoExistente = false;
    }
    
    if (dados.prioridade === 'minimo_operacional' || dados.prioridade === 'vistoria_tecnica') {
        if (!usuarioEscolheuUsarAnexoExistente) {
            const inputAnexo = document.getElementById('inputAnexo');
            if (!inputAnexo || inputAnexo.files.length === 0) {
                return {
                    valido: false,
                    mensagem: '❌ O anexo é obrigatório para esta prioridade. Por favor, selecione um arquivo PDF.'
                };
            }
            
            const arquivo = inputAnexo.files[0];
            if (!validarArquivoPDF(arquivo)) {
                return {
                    valido: false,
                    mensagem: '❌ O arquivo selecionado não é um PDF válido.'
                };
            }
        }
    }
    
    if (dados.diasSelecionados.length === 0) {
        return {
            valido: false,
            mensagem: 'Selecione pelo menos um dia para a escala.'
        };
    }
    
    return { valido: true, mensagem: 'Dados válidos' };
}

// ✅ FUNÇÃO: Limpar formulário silencioso
function limparFormularioSilencioso() {
    const form = document.getElementById('formNovaSolicitacao');
    if (form) form.reset();
    
    const inputHorarioFinal = document.getElementById('inputHorarioFinal');
    if (inputHorarioFinal) inputHorarioFinal.value = '';
    
    const divDiasMes = document.getElementById('divDiasMes');
    if (divDiasMes) divDiasMes.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
    
    const divAnexo = document.getElementById('divAnexo');
    if (divAnexo) divAnexo.style.display = 'none';
    
    const divAnexosExistentes = document.getElementById('divAnexosExistentes');
    if (divAnexosExistentes) divAnexosExistentes.remove();
    
    usarAnexoExistente = false;
}

// ✅ FUNÇÃO: Mostrar mensagem no formulário
function mostrarMensagemFormulario(mensagem, tipo, tempoFechar = 4000) {
    const mensagensDiv = document.getElementById('mensagensForm');
    if (!mensagensDiv) return;
    
    const alertClass = {
        'success': 'alert-success',
        'danger': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[tipo] || 'alert-info';
    
    const mensagemId = 'msg-' + Date.now();
    
    mensagensDiv.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" id="${mensagemId}">
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    if (tempoFechar > 0) {
        setTimeout(() => {
            const mensagemElement = document.getElementById(mensagemId);
            if (mensagemElement) {
                const bsAlert = new bootstrap.Alert(mensagemElement);
                bsAlert.close();
            }
        }, tempoFechar);
    }
}

// ✅ FUNÇÃO: Formatar ID do sistema
function formatarIdSistema(idSistema) {
    try {
        if (idSistema === null || idSistema === undefined || idSistema === '' || idSistema === '-') {
            return '-';
        }
        
        const idStr = String(idSistema);
        
        if (idStr.trim() === '' || idStr === 'null' || idStr === 'undefined') {
            return '-';
        }
        
        const apenasNumeros = idStr.replace(/\D/g, '');
        
        if (apenasNumeros.length === 0) {
            return idStr;
        }
        
        return `
            <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${apenasNumeros}" 
               target="_blank" 
               class="text-primary text-decoration-none" 
               title="Abrir escala no sistema"
               onclick="event.stopPropagation(); return false;">
               ${idStr} 
               <i class="fas fa-external-link-alt ms-1 small"></i>
            </a>
        `;
    } catch (error) {
        return idSistema || '-';
    }
}

// ✅ FUNÇÃO: Renderizar interface (LAYOUT ORIGINAL COMPLETO)
function renderInterface() {
    const content = document.getElementById('solicitacoes-content');
    if (!content) return;
    
    content.innerHTML = `
        <!-- Parte 1: Filtros COMPACTOS -->
        <div class="row mb-3">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white py-2">
                        <h6 class="mb-0"><i class="fas fa-filter me-2"></i>Filtros</h6>
                    </div>
                    <div class="card-body py-2">
                        <div class="row g-2 align-items-center">
                            <div class="col-xl-2 col-lg-3 col-md-4">
                                <label class="form-label small mb-1">OPM / Estação</label>
                                <select class="form-select form-select-sm" id="selectOpm">
                                    <option value="" ${!opmSelecionada ? 'selected' : ''}>Selecione a OPM</option>
                                    ${opmsPermitidas.map(opm => `
                                        <option value="${opm}" ${opm === opmSelecionada ? 'selected' : ''}>
                                            ${opmsNomes[opm] || opm}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1">Mês</label>
                                <select class="form-select form-select-sm" id="selectMes">
                                    ${Array.from({length: 12}, (_, i) => {
                                        const mesNum = i + 1;
                                        const mesNome = new Date(2000, i).toLocaleDateString('pt-BR', {month: 'long'});
                                        return `<option value="${mesNum}" ${mesNum === mesFiltro ? 'selected' : ''}>
                                            ${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}
                                        </option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1">Ano</label>
                                <select class="form-select form-select-sm" id="selectAno">
                                    ${(function() {
                                        const hoje = new Date();
                                        const anoAtual = hoje.getFullYear();
                                        const mesAtual = hoje.getMonth() + 1;
                                        const mostrarProximoAno = mesAtual === 12;
                                        
                                        let anos = [anoAtual];
                                        if (mostrarProximoAno) {
                                            anos.push(anoAtual + 1);
                                        }
                                        
                                        return anos.map(ano => `
                                            <option value="${ano}" ${ano === anoFiltro ? 'selected' : ''}>
                                                ${ano}
                                            </option>
                                        `).join('');
                                    })()}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-2">
                                <label class="form-label small mb-1 d-none d-md-block">&nbsp;</label>
                                <button class="btn btn-primary btn-sm w-100" id="btnAtualizarFiltro">
                                    <i class="fas fa-sync me-1"></i>Atualizar
                                </button>
                            </div>
                            ${userDataCache.nivel === 1 ? `
                            <div class="col-xl-4 col-lg-3 col-md-6">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-success btn-sm flex-grow-1" id="btnExportarCSV">
                                        <i class="fas fa-file-export me-1"></i>Exportar CSV
                                    </button>
                                    
                                    <div class="dropdown" id="notificacoes-dropdown">
                                        <button class="btn btn-warning btn-sm position-relative" data-bs-toggle="dropdown" 
                                                style="min-width: 45px; padding: 5px 10px;" title="Ver solicitações pendentes">
                                            <i class="fas fa-bell"></i>
                                            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" 
                                                id="badge-notificacoes" style="font-size: 0.55em; padding: 1px 4px;">
                                                0
                                            </span>
                                        </button>
                                        <div class="dropdown-menu dropdown-menu-end p-0" style="width: 350px;">
                                            <div class="dropdown-header bg-warning text-dark py-2">
                                                <i class="fas fa-exclamation-circle me-2"></i>Solicitações Pendentes
                                            </div>
                                            <div id="lista-notificacoes" style="max-height: 400px; overflow-y: auto;">
                                                <div class="text-center py-4">
                                                    <div class="spinner-border spinner-border-sm text-warning"></div>
                                                    <p class="small text-muted mt-2">Carregando pendências...</p>
                                                </div>
                                            </div>
                                            <div class="dropdown-divider m-0"></div>
                                            <div class="px-3 py-2">
                                                <button class="btn btn-sm btn-outline-warning w-100" id="btn-atualizar-notificacoes">
                                                    <i class="fas fa-sync-alt me-1"></i>Atualizar Lista
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Parte 2: Nova Solicitação -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-success text-white">
                        <h5 class="mb-0"><i class="fas fa-plus-circle me-2"></i>Nova Solicitação</h5>
                    </div>
                    <div class="card-body">
                        <form id="formNovaSolicitacao">
                            <div class="row g-3 mb-3">
                                <div class="col-xl-2 col-lg-3 col-md-4">
                                    <label class="form-label">Data <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control datepicker" 
                                           id="inputData" required
                                           placeholder="dd/mm/aaaa">
                                </div>
                                
                                <div class="col-xl-2 col-lg-2 col-md-3">
                                    <label class="form-label">Horário Inicial <span class="text-danger">*</span></label>
                                    <input type="time" class="form-control" 
                                           id="inputHorarioInicial" required
                                           min="00:00" max="23:55"
                                           step="300">
                                </div>
                                
                                <div class="col-xl-2 col-lg-2 col-md-3">
                                    <label class="form-label">Horário Final</label>
                                    <input type="time" class="form-control" 
                                           id="inputHorarioFinal" readonly
                                           style="background-color: #e9ecef;">
                                    <small class="text-muted">+8 horas</small>
                                </div>
                                
                                <div class="col-xl-3 col-lg-3 col-md-6">
                                    <label class="form-label">Composição <span class="text-danger">*</span></label>
                                    <select class="form-select" id="selectComposicao" required>
                                        <option value="">Selecione...</option>
                                        ${opmSelecionada && composicoesDisponiveis[opmSelecionada] ? 
                                            Object.entries(composicoesDisponiveis[opmSelecionada]).map(([cod, dados]) => `
                                                <option value="${cod}">${dados.composicao} (${cod})</option>
                                            `).join('') : ''
                                        }
                                    </select>
                                </div>
                                
                                <div class="col-xl-3 col-lg-2 col-md-6">
                                    <label class="form-label">Prioridade <span class="text-danger">*</span></label>
                                    <select class="form-select" id="selectPrioridade" required>
                                        <option value="">Selecione...</option>
                                        <option value="minimo_operacional">Mínimo Operacional</option>
                                        <option value="viatura_extra">Viatura Extra</option>
                                        <option value="vistoria_tecnica">Vistoria Técnica</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="row g-3 mb-3">
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Subten/Sgt <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center" 
                                           id="inputVagasSubten" min="0" max="99" 
                                           required style="max-width: 80px;">
                                </div>
                                
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Cb/Sd <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center" 
                                           id="inputVagasCbSd" min="0" max="99" 
                                           required style="max-width: 80px;">
                                </div>
                                
                                <div class="col-xl-10 col-lg-10 col-md-8 col-sm-6">
                                    <label class="form-label">Expandir escala para:</label>
                                    <div id="divDiasMes" class="d-flex flex-wrap gap-1 p-2 border rounded bg-light">
                                        <div class="text-muted small">Selecione uma data primeiro</div>
                                    </div>
                                    <small class="text-muted">Dias retroativos ficam desabilitados (cinza)</small>
                                </div>
                            </div>
                            
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Motivo</label>
                                    <textarea class="form-control" id="inputMotivo" rows="2"
                                              placeholder="(informar o que levou a solicitação)"></textarea>
                                </div>
                                
                                <div class="col-md-6">
                                    <label class="form-label">Observações</label>
                                    <textarea class="form-control" id="inputObservacoes" rows="2"
                                              placeholder="(anotações para lembretes particulares)"></textarea>
                                </div>
                            </div>
                            
                            <div class="row g-3 mb-3">
                                <div class="col-12" id="divAnexo" style="display: none;">
                                    <div class="border rounded p-3 bg-light">
                                        <label class="form-label fw-bold mb-2" id="labelAnexo"></label>
                                        <div class="d-flex align-items-center gap-3">
                                            <input type="file" class="form-control w-auto" id="inputAnexo" 
                                                accept=".pdf" title="Apenas arquivos PDF" 
                                                data-obrigatorio="false">
                                            <small class="text-muted flex-grow-1" id="textoAjudaAnexo"></small>
                                        </div>
                                        <div class="progress mt-2" style="height: 6px; display: none;" id="progressAnexo">
                                            <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                                 style="width: 0%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row g-3">
                                <div class="col-12">
                                    <div class="d-flex justify-content-end gap-2">
                                        <button type="button" class="btn btn-outline-secondary" id="btnLimparForm">
                                            <i class="fas fa-broom me-1"></i>Limpar Tudo
                                        </button>
                                        <button type="submit" class="btn btn-success" id="btnCadastrar">
                                            <i class="fas fa-save me-1"></i>Cadastrar Solicitação
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                        
                        <div id="mensagensForm" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Parte 3: Tabela de Solicitações (LAYOUT ORIGINAL) -->
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-info text-white d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-list me-2"></i>Solicitações do Mês</h5>
                        <div class="badge bg-light text-dark fs-6">
                            <span id="contadorSolicitacoes">0</span> solicitações
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="p-3 pb-2" id="cardsResumoSolicitacoes">
                            <div class="row g-2">
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-subsgt text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">Sub/Sgt</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoSubSgtSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoSubSgtEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoSubSgtDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-cbsd text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">Cb/Sd</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoCbSdSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoCbSdEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoCbSdDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-total text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">TOTAL</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoTotalSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoTotalEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoTotalDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                            <table class="table table-hover table-sm mb-0" id="tabelaSolicitacoes">
                                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                                    <tr class="text-center">
                                        <th width="90">AÇÕES</th>
                                        <th width="90">DATA</th>
                                        <th>COMPOSIÇÃO</th>
                                        <th width="70">COD</th>
                                        <th width="120">HORÁRIO</th>
                                        <th colspan="2" width="120" class="text-center">VAGAS SOLICITADAS</th>
                                        <th width="80" class="text-center">PRIOR.</th>
                                        <th width="80" class="text-center">STATUS</th>
                                        <th width="80">ID</th>
                                        <th width="140">PRAZO</th>
                                        <th colspan="2" width="120" class="text-center">ESCALADO</th>
                                        <th width="60"></th>
                                    </tr>
                                    <tr class="text-center small table-secondary">
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th width="60">Sub/Sgt</th>
                                        <th width="60">Cb/Sd</th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th width="60">Sub/Sgt</th>
                                        <th width="60">Cb/Sd</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="tbodySolicitacoes">
                                    <tr>
                                        <td colspan="14" class="text-center py-5">
                                            <div class="spinner-border text-primary"></div>
                                            <p class="mt-2 text-muted">Carregando solicitações...</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    inicializarDatepicker();
    inicializarEventListeners();
    atualizarTabelaSolicitacoes();
    
    setTimeout(async () => {
        const prioridadeSelect = document.getElementById('selectPrioridade');
        if (prioridadeSelect && prioridadeSelect.value) {
            await atualizarCampoAnexo(prioridadeSelect.value);
        }
    }, 500);
    
    const inputHorarioInicial = document.getElementById('inputHorarioInicial');
    if (inputHorarioInicial) {
        inputHorarioInicial.addEventListener('change', calcularHorarioFinal);
    }
    
    const inputData = document.getElementById('inputData');
    if (inputData) {
        inputData.addEventListener('change', atualizarDiasMes);
    }
    
    configurarInputHorario();
    
    if (userDataCache && userDataCache.nivel === 1) {
        setTimeout(() => {
            setupNotificacoesSolicitacoes();
            setTimeout(() => {
                if (window.carregarNotificacoesAdmin) {
                    window.carregarNotificacoesAdmin();
                }
            }, 2000);
        }, 500);
    }
}

// ✅ FUNÇÃO: Configurar input de horário
function configurarInputHorario() {
    const input = document.getElementById('inputHorarioInicial');
    if (!input) return;
    
    input.step = '300';
    
    input.addEventListener('input', function() {
        if (this.value) {
            const [hours, minutes] = this.value.split(':');
            const mins = parseInt(minutes);
            if (mins % 5 !== 0) {
                const roundedMins = Math.round(mins / 5) * 5;
                this.value = `${hours.padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`;
            }
        }
    });
}

// ✅ FUNÇÃO: Inicializar datepicker
function inicializarDatepicker() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    
    try {
        flatpickr('.datepicker', {
            dateFormat: 'd/m/Y',
            locale: 'pt',
            minDate: amanha,
            disableMobile: true,
            defaultDate: amanha,
            onChange: atualizarDiasMes
        });
    } catch (error) {
        console.warn('⚠️ Flatpickr não carregado:', error);
    }
}

// ✅ FUNÇÃO: Calcular horário final
function calcularHorarioFinal() {
    const inputInicial = document.getElementById('inputHorarioInicial');
    const inputFinal = document.getElementById('inputHorarioFinal');
    
    if (!inputInicial || !inputInicial.value) {
        if (inputFinal) inputFinal.value = '';
        return;
    }
    
    const [horas, minutos] = inputInicial.value.split(':').map(Number);
    let horasFinais = horas + 8;
    
    if (horasFinais >= 24) horasFinais -= 24;
    
    const minutosArredondados = Math.round(minutos / 5) * 5;
    
    if (inputFinal) {
        inputFinal.value = `${horasFinais.toString().padStart(2, '0')}:${minutosArredondados.toString().padStart(2, '0')}`;
    }
    
}

// ✅ FUNÇÃO: Atualizar dias do mês
function atualizarDiasMes() {
    const divDias = document.getElementById('divDiasMes');
    if (!divDias) return;
    
    const inputData = document.getElementById('inputData');
    if (!inputData || !inputData.value) {
        divDias.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
        return;
    }
    
    const [diaSelecionadoStr, mesStr, anoStr] = inputData.value.split('/');
    const diaSelecionado = parseInt(diaSelecionadoStr);
    const mes = parseInt(mesStr);
    const ano = parseInt(anoStr);
    
    const ultimoDia = new Date(ano, mes, 0).getDate();
    
    let html = '';
    for (let dia = 1; dia <= ultimoDia; dia++) {
        const dataCompleta = `${ano}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
        const dataDia = new Date(dataCompleta);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const isDiaRetroativo = dia < diaSelecionado;
        
        let disabledPorVistoria = false;
        let title = '';
        
        const disabled = isDiaRetroativo || disabledPorVistoria;
        const checked = dia === diaSelecionado;
        
        html += `
            <div class="form-check form-check-inline m-0">
                <input class="form-check-input" type="checkbox" 
                       id="dia${dia}" value="${dia}"
                       ${disabled ? 'disabled' : ''}
                       ${checked ? 'checked style="display: none;"' : ''}
                       title="${title}"
                       ${isDiaRetroativo ? 'style="opacity: 0.5;"' : ''}>
                <label class="form-check-label small ${isDiaRetroativo ? 'text-muted' : ''}" 
                       for="dia${dia}" 
                       style="padding: 2px 8px; border-radius: 4px; 
                              ${isDiaRetroativo ? 'background-color: #f8f9fa;' : ''}">
                    ${dia.toString().padStart(2, '0')}
                </label>
            </div>
        `;
    }
    
    divDias.innerHTML = html || '<small class="text-muted">Nenhum dia disponível neste mês</small>';
    
    if (diaSelecionado) {
        const info = document.createElement('div');
        info.className = 'small text-muted mt-2';
        info.innerHTML = `<i class="fas fa-info-circle me-1"></i> O dia ${diaSelecionado} está automaticamente incluído`;
        divDias.appendChild(info);
    }
}

// ✅ FUNÇÃO: Inicializar event listeners
function inicializarEventListeners() {
    const selectOpm = document.getElementById('selectOpm');
    if (selectOpm) {
        selectOpm.addEventListener('change', async (e) => {
            const valorSelecionado = e.target.value;
            
            if (!valorSelecionado) {
                alert('Por favor, selecione uma OPM para continuar');
                return;
            }
            
            opmSelecionada = valorSelecionado;
            await atualizarTabelaComDelay();
            atualizarComposicoesDropdown();
            
            const prioridade = document.getElementById('selectPrioridade')?.value;
            if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
                await atualizarCampoAnexo(prioridade);
            }
        });
    }
    
    const selectMes = document.getElementById('selectMes');
    if (selectMes) {
        selectMes.addEventListener('change', async (e) => {
            mesFiltro = parseInt(e.target.value);
            anexosExistentesCache = {};
            usarAnexoExistente = false;
            await atualizarTabelaComDelay();
        });
    }
    
    const selectAno = document.getElementById('selectAno');
    if (selectAno) {
        selectAno.addEventListener('change', async (e) => {
            anoFiltro = parseInt(e.target.value);
            anexosExistentesCache = {};
            usarAnexoExistente = false;
            await atualizarTabelaComDelay();
        });
    }
    
    const btnAtualizarFiltro = document.getElementById('btnAtualizarFiltro');
    if (btnAtualizarFiltro) {
        btnAtualizarFiltro.addEventListener('click', async () => {
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
        });
    }
    
    const formNovaSolicitacao = document.getElementById('formNovaSolicitacao');
    if (formNovaSolicitacao) {
        formNovaSolicitacao.addEventListener('submit', async (e) => {
            e.preventDefault();
            await cadastrarSolicitacao();
        });
    }
    
    const selectComposicao = document.getElementById('selectComposicao');
    if (selectComposicao) {
        selectComposicao.addEventListener('change', async () => {
            const prioridade = document.getElementById('selectPrioridade')?.value;
            if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
                await atualizarCampoAnexo(prioridade);
            }
        });
    }
    
    const inputData = document.getElementById('inputData');
    if (inputData) {
        inputData.addEventListener('change', async () => {
            const prioridade = document.getElementById('selectPrioridade')?.value;
            if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
                await atualizarCampoAnexo(prioridade);
            }
        });
    }
    
    const selectPrioridade = document.getElementById('selectPrioridade');
    if (selectPrioridade) {
        selectPrioridade.addEventListener('change', async (e) => {
            await atualizarCampoAnexo(e.target.value);
            calcularHorarioFinal();
        });
    }
    
    const btnLimparForm = document.getElementById('btnLimparForm');
    if (btnLimparForm) {
        btnLimparForm.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
                limparFormularioSilencioso();
            }
        });
    }
    
    if (userDataCache.nivel === 1) {
        const btnExportarCSV = document.getElementById('btnExportarCSV');
        if (btnExportarCSV) {
            btnExportarCSV.addEventListener('click', exportarCSV);
        }
    }
    
    const inputAnexo = document.getElementById('inputAnexo');
    if (inputAnexo) {
        inputAnexo.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                const arquivo = this.files[0];
                if (!validarArquivoPDF(arquivo)) {
                    mostrarMensagemFormulario('❌ Apenas arquivos PDF são permitidos', 'danger');
                    this.value = '';
                }
            }
        });
    }
    
    if (userDataCache && userDataCache.nivel === 1) {
        setTimeout(() => {
            setupNotificacoesSolicitacoes();
            setTimeout(() => {
                if (window.carregarNotificacoesAdmin) {
                    window.carregarNotificacoesAdmin();
                }
            }, 2000);
        }, 500);
    }
}

function exibirAtualizandoTabela() {
    const tbody = document.getElementById('tbodySolicitacoes');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="14" class="text-center py-4 text-primary">
                <i class="fas fa-spinner fa-spin me-2"></i>Atualizando
            </td>
        </tr>
    `;
}

async function atualizarTabelaComDelay() {
    const selectOpm = document.getElementById('selectOpm');
    const selectMes = document.getElementById('selectMes');
    const selectAno = document.getElementById('selectAno');

    if (!selectOpm?.value || !selectMes?.value || !selectAno?.value) {
        return;
    }

    exibirAtualizandoTabela();
    await new Promise(resolve => setTimeout(resolve, 4000));
    await carregarSolicitacoesMes();
    atualizarTabelaSolicitacoes();
}

async function registrarPendenciaSolicitacao(opmCodigo, opmNome, ano, mes) {
    try {
        const anoMes = `${ano}${mes}`;
        const pendenteRef = ref(database, `SolicPendentes/${opmCodigo}/${anoMes}`);
        const pendenteSnapshot = await get(pendenteRef);

        if (!pendenteSnapshot.exists()) {
            await set(pendenteRef, {
                tituloOPM: opmNome || opmCodigo,
                criado_em: new Date().toISOString(),
                total: 1
            });
            return;
        }

        const dadosAtuais = pendenteSnapshot.val() || {};
        await update(pendenteRef, {
            total: (dadosAtuais.total || 0) + 1,
            atualizado_em: new Date().toISOString()
        });
    } catch (pendenteError) {
        console.warn('⚠️ Erro ao registrar pendência:', pendenteError);
    }
}

async function removerPendenciaSolicitacao(opmCodigo, ano, mes) {
    try {
        const anoMes = `${ano}${mes}`;
        const pendenteRef = ref(database, `SolicPendentes/${opmCodigo}/${anoMes}`);
        const pendenteSnapshot = await get(pendenteRef);

        if (!pendenteSnapshot.exists()) return;

        const dadosAtuais = pendenteSnapshot.val() || {};
        const totalAtual = Number(dadosAtuais.total || 0);
        const novoTotal = totalAtual - 1;

        if (novoTotal <= 0) {
            await remove(pendenteRef);
            return;
        }

        await update(pendenteRef, {
            total: novoTotal,
            atualizado_em: new Date().toISOString()
        });
    } catch (pendenteError) {
        console.warn('⚠️ Erro ao remover pendência:', pendenteError);
    }
}

// ✅ FUNÇÃO: Atualizar dropdown de composições
function atualizarComposicoesDropdown() {
    const select = document.getElementById('selectComposicao');
    if (!select || !opmSelecionada) return;
    
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    if (composicoesDisponiveis[opmSelecionada]) {
        Object.entries(composicoesDisponiveis[opmSelecionada]).forEach(([cod, dados]) => {
            const option = document.createElement('option');
            option.value = cod;
            option.textContent = `${dados.composicao} (${cod})`;
            select.appendChild(option);
        });
    }
}

// ✅ FUNÇÃO: Atualizar tabela de solicitações (LAYOUT ORIGINAL COMPLETO)
async function atualizarTabelaSolicitacoes() {
    const tbody = document.getElementById('tbodySolicitacoes');
    const contador = document.getElementById('contadorSolicitacoes');
    
    if (!tbody || !contador) return;
    
    try {
        const solicitacoesValidas = solicitacoesCache.filter(s => 
            s && s.data && !s.id.includes('/anexos') && 
            s.id_simplificado && /^\d{6}$/.test(s.id_simplificado)
        );
        
        contador.textContent = solicitacoesValidas.length;
        atualizarCardsResumoSolicitacoes(solicitacoesValidas);

        if (solicitacoesValidas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox fa-2x mb-3"></i><br>
                        Nenhuma solicitação encontrada para este mês
                    </td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        solicitacoesValidas.forEach((solicitacao) => {
            let dataFormatada;
            let dataObj;
            
            if (solicitacao.data_local) {
                dataObj = solicitacao.data_local;
            } else if (solicitacao.data_extraida) {
                dataObj = new Date(solicitacao.data_extraida);
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            } else {
                dataObj = new Date(solicitacao.data);
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            }
            
            if (isNaN(dataObj.getTime())) {
                dataFormatada = 'Data inválida';
            } else {
                const dia = dataObj.getDate().toString().padStart(2, '0');
                const mes = (dataObj.getMonth() + 1).toString().padStart(2, '0');
                const ano = dataObj.getFullYear();
                dataFormatada = `${dia}/${mes}/${ano}`;
            }
            
            const statusIcon = getIconeStatus(solicitacao.status);
            const statusClass = getClasseStatus(solicitacao.status);
            const statusTooltip = getTooltipStatus(solicitacao.status);
            
            const prioridadeIcon = getIconePrioridadeCompleto(solicitacao.prioridade);
            
            const acoesHTML = gerarAcoesHTMLMelhorado(solicitacao);
            
            const vagasSubten = solicitacao.vagas_subten_sgt || 0;
            const vagasCbSd = solicitacao.vagas_cb_sd || 0;
            
            const escaladoSubten = solicitacao.escalado_subten_sgt || 0;
            const escaladoCbSd = solicitacao.escalado_cb_sd || 0;
            
            const subtenClass = (escaladoSubten < vagasSubten) ? 'text-danger fw-bold' : '';
            const cbSdClass = (escaladoCbSd < vagasCbSd) ? 'text-danger fw-bold' : '';
            
            let prazoHTML = '-';
            if (solicitacao.prazo_inscricao) {
                try {
                    const [dataPart, horaPart] = String(solicitacao.prazo_inscricao).split(' ');
                    if (dataPart && horaPart) {
                        const [dia, mes, ano] = dataPart.split('/');
                        const [horas, minutos] = horaPart.split(':');
                        prazoHTML = `${dia}/${mes} | ${horas}:${minutos}`;
                    }
                } catch (e) {}
            }
            
            let composicaoNome = solicitacao.composicao_nome || '';
            let composicaoTruncated = composicaoNome;
            let composicaoTitle = '';
            
            if (composicaoNome.length > 15) {
                composicaoTruncated = composicaoNome.substring(0, 13) + '...';
                composicaoTitle = composicaoNome;
            }
            
            const idSistema = solicitacao.id_sistema_local || '-';
            let idTruncated = idSistema;
            let idTitle = '';
            
            if (idSistema.length > 8 && idSistema !== '-') {
                idTruncated = idSistema.substring(0, 6) + '...';
                idTitle = idSistema;
            }
            
            const horarioFormatado = solicitacao.horario_inicial && solicitacao.horario_final 
                ? `${solicitacao.horario_inicial} às ${solicitacao.horario_final}`
                : '-';
            
            html += `
                <tr class="${statusClass} align-middle" id="linha-${solicitacao.id.replace(/\//g, '_')}">
                    <td class="px-1 py-2 text-center">
                        ${acoesHTML}
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <a href="#" class="link-reutilizar text-decoration-none truncate-link" 
                           data-id="${solicitacao.id}" 
                           data-fulltext="Clique para reutilizar estes dados"
                           title="Clique para reutilizar estes dados">
                            <span class="fw-semibold">
                                ${dataFormatada}
                            </span>
                        </a>
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <span class="truncate-text" data-fulltext="${composicaoNome}">
                            ${composicaoNome}
                        </span>
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <code class="bg-light px-1 py-0 rounded truncate-text" data-fulltext="${solicitacao.composicao_cod || ''}">
                            ${solicitacao.composicao_cod || ''}
                        </code>
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <span class="truncate-text" data-fulltext="${horarioFormatado}">
                            ${horarioFormatado}
                        </span>
                    </td>
                    
                    <td class="px-1 py-2 text-center fw-bold vagas-cell">
                        ${vagasSubten}
                    </td>
                    
                    <td class="px-1 py-2 text-center fw-bold vagas-cell">
                        ${vagasCbSd}
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <div class="d-flex justify-content-center">
                            ${prioridadeIcon}
                        </div>
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <span class="status-icon" data-id="${solicitacao.id}" 
                            data-status="${solicitacao.status || ''}" 
                            title="${statusTooltip}"
                            style="cursor: ${userDataCache.nivel === 1 && [1, 2, 3].includes(solicitacao.status) ? 'pointer' : 'default'}; 
                                    font-size: 1.3em; display: inline-block;">
                            ${statusIcon}
                        </span>
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        ${idSistema !== '-' ? `
                            <a href="#" class="link-id-escala text-decoration-none fw-bold truncate-link" 
                               data-id="${idSistema}"
                               data-data="${solicitacao.data}"
                               data-fulltext="${idSistema}"
                               title="Clique para ver militares escalados">
                                ${idSistema}
                            </a>
                        ` : '<span class="text-muted truncate-text">-</span>'}
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <small class="truncate-text" data-fulltext="${prazoHTML}">
                            ${prazoHTML}
                        </small>
                    </td>
                    
                    <td class="px-1 py-2 text-center fw-bold vagas-cell ${subtenClass}">
                        ${escaladoSubten}
                    </td>
                    
                    <td class="px-1 py-2 text-center fw-bold vagas-cell ${cbSdClass}">
                        ${escaladoCbSd}
                    </td>
                    
                    <td class="px-1 py-2 text-center">
                        <button class="btn btn-sm btn-outline-info btn-detalhes" 
                                data-id="${solicitacao.id}" 
                                title="Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        adicionarEventListenersTabela();
        configurarReutilizacaoDados();
        configurarLinksIdEscala();
        
    } catch (error) {
        console.error('Erro ao atualizar tabela:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i><br>
                    Erro ao carregar solicitações<br>
                    <small>${error.message}</small>
                </td>
            </tr>
        `;
    }
}

function atualizarCardsResumoSolicitacoes(solicitacoes) {
    const getNumero = (valor) => {
        const numero = parseInt(valor, 10);
        return Number.isNaN(numero) ? 0 : numero;
    };

    const totais = solicitacoes.reduce((acc, solicitacao) => {
        acc.subSgtSolicitado += getNumero(solicitacao.vagas_subten_sgt);
        acc.subSgtEscalados += getNumero(solicitacao.escalado_subten_sgt);
        acc.cbSdSolicitado += getNumero(solicitacao.vagas_cb_sd);
        acc.cbSdEscalados += getNumero(solicitacao.escalado_cb_sd);
        return acc;
    }, {
        subSgtSolicitado: 0,
        subSgtEscalados: 0,
        cbSdSolicitado: 0,
        cbSdEscalados: 0
    });

    const subSgtDiferenca = totais.subSgtSolicitado - totais.subSgtEscalados;
    const cbSdDiferenca = totais.cbSdSolicitado - totais.cbSdEscalados;
    const totalSolicitado = totais.subSgtSolicitado + totais.cbSdSolicitado;
    const totalEscalados = totais.subSgtEscalados + totais.cbSdEscalados;
    const totalDiferenca = subSgtDiferenca + cbSdDiferenca;

    const setTexto = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    };

    setTexto('resumoSubSgtSolicitado', totais.subSgtSolicitado);
    setTexto('resumoSubSgtEscalados', totais.subSgtEscalados);
    setTexto('resumoSubSgtDiferenca', subSgtDiferenca);

    setTexto('resumoCbSdSolicitado', totais.cbSdSolicitado);
    setTexto('resumoCbSdEscalados', totais.cbSdEscalados);
    setTexto('resumoCbSdDiferenca', cbSdDiferenca);

    setTexto('resumoTotalSolicitado', totalSolicitado);
    setTexto('resumoTotalEscalados', totalEscalados);
    setTexto('resumoTotalDiferenca', totalDiferenca);
}

// ✅ FUNÇÃO: Gerar HTML das ações
function gerarAcoesHTMLMelhorado(solicitacao) {
    const isAdmin = userDataCache.nivel === 1;
    const isModerador = userDataCache.nivel === 2;
    const podeAcessarOPM = opmsPermitidas.includes(solicitacao.opm_codigo);
    
    if ([1, 2, 3].includes(solicitacao.status)) {
        return '';
    }
    
    if (solicitacao.status === 5) {
        if ((isAdmin || isModerador) && podeAcessarOPM) {
            return `
                <button class="btn btn-sm btn-success btn-reativar" data-id="${solicitacao.id}" title="Reativar">
                    <i class="fas fa-undo"></i>
                </button>
            `;
        }
        return '';
    }
    
    const podeEditar = (isAdmin || (isModerador && podeAcessarOPM));
    
    if (!podeEditar) return '';
    
    if (solicitacao.status === 4 || !solicitacao.status) {
        return `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-sm btn-outline-primary btn-editar" data-id="${solicitacao.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-excluir" data-id="${solicitacao.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
    
    return '';
}

// ✅ FUNÇÃO: Adicionar event listeners à tabela
function adicionarEventListenersTabela() {
    document.querySelectorAll('.btn-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            mostrarDetalhesSolicitacao(id);
        });
    });
    
    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.status-icon').forEach(span => {
            span.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status;
                
                if (['1', '2', '3'].includes(status)) {
                    liberarParaEdicaoAdmin(id, status);
                } else if (status === '4') {
                    liberarParaEdicao(id);
                }
            });
        });
    }
    
    if (userDataCache.nivel <= 2) {
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                iniciarEdicao(id);
            });
        });
        
        document.querySelectorAll('.btn-excluir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                excluirSolicitacao(id);
            });
        });
        
        document.querySelectorAll('.btn-atualizar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                confirmarEdicao(id);
            });
        });
        
        document.querySelectorAll('.btn-cancelar-edicao').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                cancelarEdicao(id);
            });
        });
    }
    
    if (userDataCache.nivel === 1 || userDataCache.nivel === 2) {
        document.querySelectorAll('.btn-reativar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                reativarSolicitacao(id);
            });
        });
    }
    
    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            reutilizarDadosSolicitacao(id);
        });
    });
}

// ✅ FUNÇÃO: Configurar reutilização de dados
function configurarReutilizacaoDados() {
    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            await reutilizarDadosSolicitacao(id);
        });
    });
}

// ✅ FUNÇÃO: Reutilizar dados
async function reutilizarDadosSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) {
        mostrarMensagemFormulario('❌ Solicitação não encontrada', 'danger');
        return;
    }
    
    try {
        document.getElementById('selectComposicao').value = solicitacao.composicao_cod;
        document.getElementById('inputHorarioInicial').value = solicitacao.horario_inicial;
        document.getElementById('selectPrioridade').value = solicitacao.prioridade;
        document.getElementById('inputVagasSubten').value = solicitacao.vagas_subten_sgt;
        document.getElementById('inputVagasCbSd').value = solicitacao.vagas_cb_sd;
        document.getElementById('inputMotivo').value = solicitacao.motivo || '';
        document.getElementById('inputObservacoes').value = solicitacao.observacoes || '';
        
        calcularHorarioFinal();
        atualizarCampoAnexo(solicitacao.prioridade);
        
        document.getElementById('formNovaSolicitacao').scrollIntoView({ behavior: 'smooth' });
        
        mostrarMensagemFormulario('✅ Dados carregados! Agora selecione uma nova data.', 'success');
        
    } catch (error) {
        console.error('Erro ao reutilizar dados:', error);
        mostrarMensagemFormulario('❌ Erro ao carregar dados', 'danger');
    }
}

// ✅ FUNÇÃO: Configurar links de ID da escala
function configurarLinksIdEscala() {
    document.querySelectorAll('.link-id-escala').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const idSistema = e.currentTarget.dataset.id;
            const dataSolicitacao = e.currentTarget.dataset.data;
            
            if (idSistema && idSistema !== '-' && idSistema !== '') {
                buscarEscaladosModal(idSistema, dataSolicitacao);
            }
        });
    });
}

// ✅ FUNÇÃO: Funções auxiliares de ícones
function getIconeStatus(status) {
    switch(status) {
        case 1: return '<i class="fas fa-check-circle text-success"></i>';
        case 2: return '<i class="fas fa-exclamation-triangle text-warning"></i>';
        case 3: return '<i class="fas fa-times-circle text-danger"></i>';
        case 4: return '<i class="fas fa-hand-paper text-warning"></i>';
        case 5: return '<i class="fas fa-trash-alt text-secondary"></i>';
        default: return '';
    }
}

function getClasseStatus(status) {
    switch(status) {
        case 4: return 'table-warning';
        case 5: return 'table-danger';
        default: return '';
    }
}

function getIconePrioridadeCompleto(prioridade) {
    switch(prioridade) {
        case 'minimo_operacional':
            return '<span class="badge bg-success" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Mínimo</span>';
        case 'vistoria_tecnica':
            return '<span class="badge bg-warning text-dark" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Vistoria</span>';
        case 'viatura_extra':
            return '<span class="badge bg-info" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Extra</span>';
        default:
            return '<span class="badge bg-secondary" style="font-size: 0.8rem; padding: 4px 8px;">-</span>';
    }
}

// ✅ FUNÇÃO: Obter URL do anexo via nó anexos
async function obterUrlAnexoSolicitacao(solicitacao) {
    if (!solicitacao?.id || !solicitacao?.comprovante_anexo) return null;

    try {
        const numeroAnexo = String(solicitacao.comprovante_anexo).padStart(2, '0');
        const partesId = solicitacao.id.split('/');
        if (partesId.length < 4) return null;

        const [ano, mes, opmCodigo, composicaoCod] = partesId;
        const caminho = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos/${numeroAnexo}/url`;
        const anexoRef = ref(database, caminho);
        const snapshot = await get(anexoRef);

        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.warn('⚠️ Não foi possível obter URL do anexo de referência:', error);
        return null;
    }
}

// ✅ FUNÇÃO: Mostrar detalhes da solicitação
async function mostrarDetalhesSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;
    
    const modalId = `modalDetalhes-${Date.now()}`;
    
    let anexoHTML = '<small class="text-muted">Nenhum anexo</small>';
    const urlAnexoReferencia = await obterUrlAnexoSolicitacao(solicitacao);

    if (solicitacao.comprovante_anexo) {
        if (urlAnexoReferencia) {
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo (${solicitacao.comprovante_anexo}):</strong></label>
                    <div>
                        <a href="${urlAnexoReferencia}" target="_blank" class="btn btn-sm btn-primary">
                            <i class="fas fa-external-link-alt me-1"></i>Visualizar Anexo
                        </a>
                    </div>
                </div>
            `;
        } else {
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo (${solicitacao.comprovante_anexo}):</strong></label>
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        URL do anexo não disponível no nó anexos.
                    </div>
                </div>
            `;
        }
    }
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-info-circle me-2"></i>
                            Detalhes da Solicitação
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Data:</strong> ${(() => {
                                    try {
                                        const dataObj = new Date(solicitacao.data);
                                        const dataAjustada = new Date(dataObj.getTime() + (3 * 60 * 60 * 1000));
                                        return dataAjustada.toLocaleDateString('pt-BR');
                                    } catch (e) {
                                        return solicitacao.data || 'Data inválida';
                                    }
                                })()}<br>
                                <strong>Horário:</strong> ${solicitacao.horario_inicial} às ${solicitacao.horario_final}<br>
                                <strong>OPM:</strong> ${solicitacao.opm_nome} (${solicitacao.opm_codigo})<br>
                            </div>
                            <div class="col-md-6">
                                <strong>Vagas:</strong> ${solicitacao.vagas_subten_sgt} Subten/Sgt, ${solicitacao.vagas_cb_sd} Cb/Sd<br>
                                <strong>Prioridade:</strong> ${solicitacao.prioridade}<br>
                                <strong>Composição:</strong> ${solicitacao.composicao_nome} (${solicitacao.composicao_cod})
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label"><strong>Motivo:</strong></label>
                            <textarea class="form-control" id="modalMotivo${modalId}" rows="2">${solicitacao.motivo || ''}</textarea>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label"><strong>Observações:</strong></label>
                            <textarea class="form-control" id="modalObservacoes${modalId}" rows="2">${solicitacao.observacoes || ''}</textarea>
                        </div>
                        
                        ${anexoHTML}
                        
                        ${userDataCache.nivel === 1 ? `
                        <div class="mb-3">
                            <label class="form-label"><strong>Administração:</strong></label>
                            <textarea class="form-control" id="modalAdministracao${modalId}" rows="2">${solicitacao.administracao || ''}</textarea>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarDetalhes${modalId}">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    const btnSalvar = document.getElementById(`btnSalvarDetalhes${modalId}`);
    if (btnSalvar) {
        btnSalvar.onclick = () => salvarDetalhesSolicitacao(id, modalContainer, modalId);
    }
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
            if (modalContainer.parentNode) {
                modalContainer.parentNode.removeChild(modalContainer);
            }
        }, 300);
    });
}

// ✅ FUNÇÃO: Download base64 (mantido para compatibilidade)
function downloadBase64(base64Data, filename) {
    try {
        const parts = base64Data.split(';base64,');
        const mimeType = parts[0].split(':')[1];
        const data = parts[1];
        
        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: mimeType});
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Erro ao fazer download:', error);
        mostrarMensagemFormulario('❌ Erro ao fazer download do anexo', 'danger');
    }
}

// ✅ FUNÇÃO: Salvar detalhes
async function salvarDetalhesSolicitacao(id, modalContainer, modalId) {
    try {
        const solicitacao = solicitacoesCache.find(s => s.id === id);
        if (!solicitacao) return;
        
        const podeEditar = (
            userDataCache.nivel === 1 ||
            (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo))
        );
        
        if (!podeEditar) {
            mostrarMensagemFormulario('❌ Você não tem permissão para editar esta solicitação', 'danger');
            return;
        }
        
        const motivo = document.getElementById(`modalMotivo${modalId}`).value;
        const observacoes = document.getElementById(`modalObservacoes${modalId}`).value;
        
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        if (!solicitacao.status || solicitacao.status !== 4) {
            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                motivo_anterior: solicitacao.motivo || '',
                observacoes_anteriores: solicitacao.observacoes || ''
            });
            await update(historicoRef, entradaHistorico);
            
            await update(solicitacaoRef, {
                status: 4,
                motivo: motivo,
                observacoes: observacoes
            });
            
            mostrarMensagemFormulario('✋ Detalhes atualizados. Solicitação em modo de edição.', 'info');
            
        } else {
            const updates = {
                motivo: motivo,
                observacoes: observacoes
            };
            
            if (userDataCache.nivel === 1) {
                const administracao = document.getElementById(`modalAdministracao${modalId}`).value;
                updates.administracao = administracao;
            }
            
            await update(solicitacaoRef, updates);
            
            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                campos_alterados: Object.keys(updates)
            });
            await update(historicoRef, entradaHistorico);
            
            mostrarMensagemFormulario('✅ Detalhes atualizados! Solicitação continua em edição.', 'success');
        }
        
        const [ano, mes, opmCodigo] = id.split('/');
        const opmNome = opmsNomes[opmCodigo] || solicitacao.opm_nome || opmCodigo;
        await registrarPendenciaSolicitacao(opmCodigo, opmNome, ano, mes);

        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].motivo = motivo;
            solicitacoesCache[index].observacoes = observacoes;
            if (userDataCache.nivel === 1) {
                solicitacoesCache[index].administracao = document.getElementById(`modalAdministracao${modalId}`).value;
            }
        }
        
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
    } catch (error) {
        console.error('Erro ao salvar detalhes:', error);
        mostrarMensagemFormulario('❌ Erro ao salvar detalhes', 'danger');
    }
}

// ✅ FUNÇÃO: Iniciar edição
async function iniciarEdicao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;
    
    const podeEditar = (
        userDataCache.nivel === 1 ||
        (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo) &&
         ![1, 2, 3].includes(solicitacao.status))
    );
    
    if (!podeEditar) {
        mostrarMensagemFormulario('❌ Você não tem permissão para editar esta solicitação', 'danger');
        return;
    }
    
    try {
        transformarCelulasEmInputs(id, solicitacao);
        atualizarBotoesParaModoEdicao(id);
        mostrarMensagemFormulario('✋ Editando solicitação - Clique em "Atualizar" para confirmar', 'info');
    } catch (error) {
        console.error('Erro ao iniciar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao iniciar edição', 'danger');
    }
}

// ✅ FUNÇÃO: Transformar células em inputs
function transformarCelulasEmInputs(id, solicitacao) {
    const linhaId = `linha-${id.replace(/\//g, '_')}`;
    const linha = document.getElementById(linhaId);
    if (!linha) return;
    
    const celulaSubten = linha.cells[5];
    celulaSubten.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center" 
               id="editSubten${linhaId}" 
               value="${solicitacao.vagas_subten_sgt || 0}"
               min="0" max="99" style="width: 60px;">
    `;
    
    const celulaCbSd = linha.cells[6];
    celulaCbSd.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center" 
               id="editCbSd${linhaId}" 
               value="${solicitacao.vagas_cb_sd || 0}"
               min="0" max="99" style="width: 60px;">
    `;
}

// ✅ FUNÇÃO: Atualizar botões para modo edição
function atualizarBotoesParaModoEdicao(id) {
    const linhaId = `linha-${id.replace(/\//g, '_')}`;
    const linha = document.getElementById(linhaId);
    if (!linha) return;
    
    const celulaAcoes = linha.cells[0];
    celulaAcoes.innerHTML = `
        <div class="d-flex gap-1 justify-content-center">
            <button class="btn btn-sm btn-warning btn-atualizar" data-id="${id}" title="Atualizar">
                <i class="fas fa-redo"></i>
            </button>
            <button class="btn btn-sm btn-secondary btn-cancelar-edicao" data-id="${id}" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    const btnAtualizar = linha.querySelector('.btn-atualizar');
    const btnCancelar = linha.querySelector('.btn-cancelar-edicao');
    
    if (btnAtualizar) btnAtualizar.onclick = () => confirmarEdicao(id);
    if (btnCancelar) btnCancelar.onclick = () => cancelarEdicao(id);
}

// ✅ FUNÇÃO: Confirmar edição
async function confirmarEdicao(id) {
    try {
        const linhaId = `linha-${id.replace(/\//g, '_')}`;
        
        const inputSubten = document.getElementById(`editSubten${linhaId}`);
        const inputCbSd = document.getElementById(`editCbSd${linhaId}`);
        
        if (!inputSubten || !inputCbSd) {
            throw new Error('Não foi possível encontrar os campos de edição');
        }
        
        const novasVagasSubten = parseInt(inputSubten.value) || 0;
        const novasVagasCbSd = parseInt(inputCbSd.value) || 0;
        
        if (novasVagasSubten < 0 || novasVagasCbSd < 0) {
            mostrarMensagemFormulario('❌ As vagas não podem ser negativas', 'danger');
            return;
        }
        
        const solicitacaoAtual = solicitacoesCache.find(s => s.id === id);
        if (!solicitacaoAtual) return;
        
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            vagas_anteriores: {
                subten_sgt: solicitacaoAtual.vagas_subten_sgt,
                cb_sd: solicitacaoAtual.vagas_cb_sd
            },
        });
        await update(historicoRef, entradaHistorico);
        
        await update(solicitacaoRef, {
            vagas_subten_sgt: novasVagasSubten,
            vagas_cb_sd: novasVagasCbSd,
            status: 4
        });
        
        const [ano, mes, opmCodigo] = id.split('/');
        const opmNome = opmsNomes[opmCodigo] || solicitacaoAtual.opm_nome || opmCodigo;
        await registrarPendenciaSolicitacao(opmCodigo, opmNome, ano, mes);

        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].vagas_subten_sgt = novasVagasSubten;
            solicitacoesCache[index].vagas_cb_sd = novasVagasCbSd;
            solicitacoesCache[index].status = 4;
        }
        
        solicitacoesCache = [];
        await carregarSolicitacoesMes();
        await atualizarTabelaSolicitacoes();

        mostrarMensagemFormulario('✅ Vagas atualizadas! Solicitação agora está em modo de edição (status 4).', 'success');
        
    } catch (error) {
        console.error('Erro ao confirmar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao atualizar vagas', 'danger');
    }
}

// ✅ FUNÇÃO: Cancelar edição
async function cancelarEdicao(id) {
    try {
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        mostrarMensagemFormulario('Edição cancelada - Nenhuma alteração foi salva', 'info');
    } catch (error) {
        console.error('Erro ao cancelar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao cancelar edição', 'danger');
    }
}

// ✅ FUNÇÃO: Excluir solicitação
async function excluirSolicitacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta solicitação?')) return;
    
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        await update(solicitacaoRef, {
            status: 5
        });
        
        const [ano, mes, opmCodigo] = id.split('/');
        const opmNome = opmsNomes[opmCodigo] || opmCodigo;
        await registrarPendenciaSolicitacao(opmCodigo, opmNome, ano, mes);

        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico();
        await update(historicoRef, entradaHistorico);
        
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('🗑️ Solicitação marcada como excluída', 'warning');
        
    } catch (error) {
        console.error('Erro ao excluir:', error);
        mostrarMensagemFormulario('❌ Erro ao excluir solicitação', 'danger');
    }
}

// ✅ FUNÇÃO: Reativar solicitação
async function reativarSolicitacao(id) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        await update(solicitacaoRef, {
            status: 4
        });
        
        const [ano, mes, opmCodigo] = id.split('/');
        await removerPendenciaSolicitacao(opmCodigo, ano, mes);
        
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Reativada pelo administrador (status 5 → 4)'
        });
        await update(historicoRef, entradaHistorico);
        
        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].status = 4;
        }
        
        atualizarTabelaSolicitacoes();
        mostrarMensagemFormulario('✅ Solicitação reativada (status 4 - Em edição)', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao reativar:', error);
        mostrarMensagemFormulario('❌ Erro ao reativar solicitação', 'danger');
    }
}

// ✅ FUNÇÃO: Liberar para edição
function liberarParaEdicao(id) {
    const modalId = `modalLiberarEdicao-${Date.now()}`;
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-unlock me-2"></i>
                            Liberar para Edição
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Tem certeza que deseja liberar esta solicitação para edição?</p>
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            A solicitação será desbloqueada e poderá ser editada pelo usuário que a criou.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-warning" id="btnConfirmarLiberar${modalId}">Liberar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    const btnConfirmar = document.getElementById(`btnConfirmarLiberar${modalId}`);
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarLiberacao(id, modalContainer, modalId);
    }
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => modalContainer.remove(), 300);
    });
}

// ✅ FUNÇÃO: Liberar para edição admin
function liberarParaEdicaoAdmin(id, statusAtual) {
    const modalId = `modalLiberarEdicaoAdmin-${Date.now()}`;
    
    const textosStatus = {
        '1': { titulo: 'Desbloquear Solicitação Aprovada', descricao: 'Esta solicitação está LANÇADA NO SISTEMA. Tem certeza que deseja liberar para edição?' },
        '2': { titulo: 'Desbloquear Solicitação Exportada', descricao: 'Esta solicitação está EXPORTADA. Tem certeza que deseja liberar para edição?' },
        '3': { titulo: 'Desbloquear Solicitação Cancelada', descricao: 'Esta solicitação está CANCELADA. Tem certeza que deseja liberar para edição?' }
    };
    
    const texto = textosStatus[statusAtual] || { 
        titulo: 'Liberar para Edição', 
        descricao: 'Tem certeza que deseja liberar esta solicitação para edição?' 
    };
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-unlock me-2"></i>
                            ${texto.titulo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${texto.descricao}</p>
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            Após liberar, o status será removido e aparecerão os botões de edição.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-warning" id="btnConfirmarLiberarAdmin${modalId}">Liberar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    const btnConfirmar = document.getElementById(`btnConfirmarLiberarAdmin${modalId}`);
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarLiberacaoAdmin(id, modalContainer, modalId);
    }
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
            if (modalContainer.parentNode) {
                modalContainer.parentNode.removeChild(modalContainer);
            }
        }, 300);
    });
}

// ✅ FUNÇÃO: Confirmar liberação admin
async function confirmarLiberacaoAdmin(id, modalContainer, modalId) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        await update(solicitacaoRef, {
            status: null
        });
        
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Liberado pelo administrador (status 1,2,3 → vazio)'
        });
        await update(historicoRef, entradaHistorico);
        
        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].status = null;
        }
        
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        mostrarMensagemFormulario('🔓 Solicitação liberada para edição', 'success');
        
    } catch (error) {
        console.error('Erro ao liberar:', error);
        mostrarMensagemFormulario('❌ Erro ao liberar solicitação', 'danger');
    }
}

// ✅ FUNÇÃO: Confirmar liberação
async function confirmarLiberacao(id, modalContainer, modalId) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        await update(solicitacaoRef, {
            status: null
        });
        
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Liberado pelo administrador para edição'
        });
        await update(historicoRef, entradaHistorico);
        
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        mostrarMensagemFormulario('🔓 Solicitação liberada para edição', 'success');
        
    } catch (error) {
        console.error('Erro ao liberar:', error);
        mostrarMensagemFormulario('❌ Erro ao liberar solicitação', 'danger');
    }
}

// ✅ FUNÇÃO: Exportar CSV
async function exportarCSV() {
    try {
        const paraExportar = solicitacoesCache.filter(s => 
            !s.status || s.status === 4 || s.status === 5
        );
        
        if (paraExportar.length === 0) {
            alert('Nenhuma solicitação para exportar.');
            return;
        }
        
        if (!confirm(`Exportar ${paraExportar.length} solicitações?\n\nApós exportar, as solicitações serão bloqueadas para edição.`)) {
            return;
        }
        
        const dadosCSV = paraExportar.map(s => ({
            ID: s.id,
            Data: new Date(s.data).toLocaleDateString('pt-BR'),
            OPM_Codigo: s.opm_codigo,
            OPM_Nome: s.opm_nome,
            Composicao_Cod: s.composicao_cod,
            Composicao_Nome: s.composicao_nome,
            Descricao: s.descricao || '',
            Horario_Inicial: s.horario_inicial,
            Horario_Final: s.horario_final,
            Vagas_Subten_Sgt: s.vagas_subten_sgt,
            Vagas_Cb_Sd: s.vagas_cb_sd,
            Prioridade: s.prioridade,
            Motivo: s.motivo || '',
            Observacoes: s.observacoes || '',
            Status_Atual: s.status || '',
            Criado_Por: s.criado_por_nome,
            Criado_Em: new Date(s.criado_em).toLocaleString('pt-BR'),
            Historico: JSON.stringify(s.historico || {})
        }));
        
        const ws = XLSX.utils.json_to_sheet(dadosCSV);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Solicitações");
        
        const mesStr = mesFiltro.toString().padStart(2, '0');
        const nomeArquivo = `solicitacoes_${opmSelecionada}_${anoFiltro}${mesStr}.csv`;
        
        XLSX.writeFile(wb, nomeArquivo);
        
        for (const solicitacao of paraExportar) {
            const solicitacaoRef = ref(database, `solicitacoes/${solicitacao.id}`);
            await update(solicitacaoRef, {
                status: 2
            });
            
            const historicoRef = ref(database, `solicitacoes/${solicitacao.id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                exportado_por_re: userRE,
                exportado_por_nome: userDataCache.nome
            });
            await update(historicoRef, entradaHistorico);
        }
        
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario(`✅ ${paraExportar.length} solicitações exportadas e bloqueadas para edição`, 'success');
        
    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        mostrarMensagemFormulario('❌ Erro ao exportar CSV', 'danger');
    }
}

// ✅ FUNÇÃO: Setup notificações
function setupNotificacoesSolicitacoes() {
    const userLevel = sessionStorage.getItem('userLevel');
    const notificacoesDropdown = document.getElementById('notificacoes-dropdown');
    
    if (userLevel !== '1' || !notificacoesDropdown) {
        if (notificacoesDropdown) notificacoesDropdown.style.display = 'none';
        return;
    }
    
    notificacoesDropdown.style.display = 'block';
    
    document.addEventListener('click', async (e) => {
        const btnAtualizar = e.target.closest('#btn-atualizar-notificacoes');
        if (!btnAtualizar) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const originalHTML = btnAtualizar.innerHTML;
        btnAtualizar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        btnAtualizar.disabled = true;
        
        const dropdownToggle = notificacoesDropdown.querySelector('[data-bs-toggle="dropdown"]');
        if (dropdownToggle && typeof bootstrap !== 'undefined') {
            const dropdown = bootstrap.Dropdown.getOrCreateInstance(dropdownToggle);
            dropdown.show();
        }
        
        if (window.carregarNotificacoesAdmin) {
            await window.carregarNotificacoesAdmin();
        }
        
        btnAtualizar.innerHTML = originalHTML;
        btnAtualizar.disabled = false;
    });
    
    document.addEventListener('click', (e) => {
        const item = e.target.closest('.notificacao-item');
        if (!item) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const opmCodigo = item.dataset.opm;
        const ano = item.dataset.ano;
        const mes = item.dataset.mes;
        
        if (!opmCodigo) return;
        
        if (typeof bootstrap !== 'undefined') {
            const dropdownToggle = notificacoesDropdown.querySelector('[data-bs-toggle="dropdown"]');
            if (dropdownToggle) {
                const dropdown = bootstrap.Dropdown.getInstance(dropdownToggle);
                if (dropdown) dropdown.hide();
            }
        }
        
        if (window.aplicarFiltrosSolicitacoes) {
            window.aplicarFiltrosSolicitacoes(opmCodigo, mes, ano);
        } else {
            const selectOpm = document.getElementById('selectOpm');
            if (selectOpm) {
                selectOpm.value = opmCodigo;
                selectOpm.dispatchEvent(new Event('change'));
            }
            
            if (ano && mes) {
                const selectAno = document.getElementById('selectAno');
                const selectMes = document.getElementById('selectMes');
                if (selectAno) selectAno.value = ano;
                if (selectMes) selectMes.value = mes;
            }
        }
        
        setTimeout(() => {
            const tabela = document.querySelector('#tabelaSolicitacoes');
            if (tabela) tabela.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    });
    
    const badge = document.getElementById('badge-notificacoes');
    if (badge) {
        badge.textContent = '0';
        badge.classList.remove('bg-danger');
        badge.classList.add('bg-secondary');
    }
}

// ✅ FUNÇÃO: Mostrar erro
function showSolicitacoesError(error) {
    const content = document.getElementById('solicitacoes-content');
    if (!content) return;
    
    content.innerHTML = `
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

// ✅ FUNÇÕES GLOBAIS
window.aplicarFiltroOPM = function(opmCodigo) {
    console.log('🎯 aplicarFiltroOPM chamado com:', opmCodigo);
    
    if (!opmCodigo) return;
    
    const tentarAplicarFiltro = () => {
        const selectOpm = document.getElementById('selectOpm');
        if (!selectOpm) return false;
        
        selectOpm.value = opmCodigo;
        const changeEvent = new Event('change', { bubbles: true });
        selectOpm.dispatchEvent(changeEvent);
        opmSelecionada = opmCodigo;
        
        return true;
    };
    
    if (tentarAplicarFiltro()) {
        console.log('✅ Filtro aplicado imediatamente');
        return;
    }
    
    let tentativas = 0;
    const maxTentativas = 10;
    const intervalo = setInterval(() => {
        tentativas++;
        
        if (tentarAplicarFiltro()) {
            console.log(`✅ Filtro aplicado após ${tentativas} tentativa(s)`);
            clearInterval(intervalo);
        } else if (tentativas >= maxTentativas) {
            console.warn(`⚠️ Não foi possível aplicar filtro após ${maxTentativas} tentativas`);
            clearInterval(intervalo);
        }
    }, 500);
};

window.aplicarFiltrosSolicitacoes = function(opm, mes, ano) {
    console.log('🎯 Aplicando filtros:', { opm, mes, ano });
    
    if (opm) opmSelecionada = opm;
    if (mes) mesFiltro = parseInt(mes);
    if (ano) anoFiltro = parseInt(ano);
    
    const selectOpm = document.getElementById('selectOpm');
    const selectMes = document.getElementById('selectMes');
    const selectAno = document.getElementById('selectAno');
    
    if (selectOpm && opm) selectOpm.value = opm;
    if (selectMes && mes) selectMes.value = mes;
    if (selectAno && ano) selectAno.value = ano;
    
    if (opmSelecionada) {
        carregarSolicitacoesMes().then(() => {
            atualizarTabelaSolicitacoes();
            if (selectOpm) atualizarComposicoesDropdown();
        });
    }
};

window.buscarEscaladosModal = buscarEscaladosModal;
window.carregarNotificacoesAdmin = carregarNotificacoesAdmin;
window.atualizarBadgeNotificacoes = function(numero) {
    const badge = document.getElementById('badge-notificacoes');
    if (!badge) return;
    
    if (numero > 0) {
        badge.textContent = numero > 99 ? '99+' : numero.toString();
        badge.classList.remove('bg-secondary');
        badge.classList.add('bg-danger');
    } else {
        badge.textContent = '0';
        badge.classList.remove('bg-danger');
        badge.classList.add('bg-secondary');
    }
};

// Estilos adicionais
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(255, 193, 7, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); }
    }
    
    .pulse-animation {
        animation: pulse 2s infinite;
    }
    
    .notificacao-item:hover {
        background-color: rgba(255, 193, 7, 0.1) !important;
        cursor: pointer;
    }
    
    #notificacoes-dropdown .dropdown-menu {
        border: 1px solid #ffc107;
    }
    
    .excluir-pendencia {
        transition: all 0.2s;
    }
    
    .excluir-pendencia:hover {
        background-color: #dc3545 !important;
        color: white !important;
        border-color: #dc3545 !important;
    }
`;
document.head.appendChild(style);

// Se carregando como página normal
if (!window.location.pathname.includes('app.html') && !document.getElementById('app-content')) {
    document.addEventListener('DOMContentLoaded', async function() {
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        await initSolicitacoes();
    });
}

export default initSolicitacoes;