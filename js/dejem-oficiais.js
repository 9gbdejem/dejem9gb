import { checkAuth, loadNavbar } from './auth-check.js';
import { database } from './firebase-config.js';
import {
    get, ref, remove, runTransaction, serverTimestamp, set, update
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';
import { obterAcessoDejemOficiais, obterMilitarGeral, postoEhOficial } from './dejem-oficiais-acesso.js';

let acessoAtual = null;
let ofertasMes = {};
let escolhasMes = {};
let oficialAdminSelecionado = null;
let mesAtual = '';
let eventos = null;
let temporizadorMensagem = null;
let locaisOfertaAtual = {};
let sequenciaCarregamentoLocais = 0;

const STATUS = {
    aguardando: ['Aguardando', 'secondary'],
    importando: ['Importando', 'info'],
    importada: ['Importada', 'primary'],
    cadastrada: ['Cadastrada', 'warning'],
    montada: ['Montada', 'success'],
    cancelada: ['Cancelada', 'danger'],
    nenhum_inscrito: ['Nenhum inscrito', 'dark'],
    divergencia: ['Divergência', 'danger']
};

function escaparHTML(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function normalizarTexto(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ').trim().toUpperCase();
}

function chaveComposicaoOficial(valor) {
    let chave = String(valor || '').trim().toUpperCase().replaceAll(' ', '_');
    ['.', '#', '$', '[', ']', '/'].forEach(caractere => {
        chave = chave.replaceAll(caractere, '_');
    });
    return chave;
}

function mesBrasilAtual() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'
    }).formatToParts(new Date());
    const ano = partes.find(item => item.type === 'year')?.value;
    const mes = partes.find(item => item.type === 'month')?.value;
    return `${ano}-${mes}`;
}

function nomeMes(mesReferencia) {
    const [ano, mes] = String(mesReferencia).split('-').map(Number);
    if (!ano || !mes) return mesReferencia;
    const texto = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
        .format(new Date(Date.UTC(ano, mes - 1, 2)));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function mostrarMensagem(texto, tipo = 'info') {
    const elemento = document.getElementById('mensagemDejemOficiais');
    if (!elemento) return;
    if (temporizadorMensagem) clearTimeout(temporizadorMensagem);
    elemento.className = `alert alert-${tipo}`;
    elemento.textContent = texto;
    elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
    temporizadorMensagem = setTimeout(limparMensagem, 5000);
}

function limparMensagem() {
    const elemento = document.getElementById('mensagemDejemOficiais');
    if (!elemento) return;
    if (temporizadorMensagem) {
        clearTimeout(temporizadorMensagem);
        temporizadorMensagem = null;
    }
    elemento.className = 'alert d-none';
    elemento.textContent = '';
}

function preencherMeses() {
    const select = document.getElementById('selectMesOficiais');
    if (!select) return;
    const [anoAtual, mesAtualNumero] = mesBrasilAtual().split('-').map(Number);
    select.innerHTML = '';
    for (let deslocamento = 3; deslocamento >= -12; deslocamento -= 1) {
        const data = new Date(Date.UTC(anoAtual, mesAtualNumero - 1 + deslocamento, 2));
        const valor = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
        select.add(new Option(nomeMes(valor), valor));
    }
    select.value = mesBrasilAtual();
    mesAtual = select.value;
}

function somarOitoHoras(hora) {
    const [horas, minutos] = String(hora || '').split(':').map(Number);
    if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return '';
    const total = (horas * 60 + minutos + 8 * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function categoriaPorPosto(posto) {
    const normalizado = normalizarTexto(posto);
    if (['CEL PM', 'CORONEL PM', 'TEN CEL PM', 'TENENTE CORONEL PM', 'MAJ PM', 'MAJOR PM'].includes(normalizado)) {
        return 'superior';
    }
    if (['CAP PM', 'CAPITAO PM'].includes(normalizado)) return 'intermediario';
    if (['1. TEN PM', '1 TEN PM', '1. TENENTE PM', '1 TENENTE PM',
        '2. TEN PM', '2 TEN PM', '2. TENENTE PM', '2 TENENTE PM'].includes(normalizado)) {
        return 'subalterno';
    }
    return '';
}

function quantidadesPorPosto(posto) {
    const categoria = categoriaPorPosto(posto);
    return {
        Solic_Superior: categoria === 'superior' ? 1 : 0,
        Solic_Intermed: categoria === 'intermediario' ? 1 : 0,
        Solic_Subalterno: categoria === 'subalterno' ? 1 : 0,
        Solic_Subten_Sgt: 0,
        Solic_Cb_Sd: 0
    };
}

function hojeBrasilISO() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valor = tipo => partes.find(item => item.type === tipo)?.value || '';
    return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function dataComDiaSemana(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);
    if (!ano || !mes || !dia) return { data: '-', diaSemana: '' };
    const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
    return {
        data: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`,
        diaSemana: dias[data.getUTCDay()]
    };
}

function ehFimDeSemana(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);
    if (!ano || !mes || !dia) return false;
    const diaSemana = new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay();
    return diaSemana === 0 || diaSemana === 6;
}

function militarFormatado(escolha) {
    const posto = String(escolha.oficial_post_grad || '').replace('TENENTE', 'TEN').replace('SARGENTO', 'SGT');
    const nomeCompleto = String(escolha.oficial_nome || escolha.oficial_nome_exibicao || '').trim();
    return [posto, escolha.oficial_re, nomeCompleto]
        .filter(Boolean).join(' ');
}

async function carregarMes() {
    const corpo = document.getElementById('dejemOficiaisBody');
    if (corpo) corpo.innerHTML = '<tr><td colspan="10" class="text-center py-4"><div class="spinner-border text-primary"></div></td></tr>';

    const chaveMes = mesAtual.replace('-', '');
    const [ofertasSnap, escolhasSnap] = await Promise.all([
        get(ref(database, `dejemOficiais/ofertas/${chaveMes}`)),
        get(ref(database, `dejemOficiais/escolhas/${chaveMes}`))
    ]);
    ofertasMes = ofertasSnap.exists() ? ofertasSnap.val() : {};
    escolhasMes = escolhasSnap.exists() ? escolhasSnap.val() : {};
    preencherOfertas();
    atualizarResumoMensal();
    renderizarOfertasAdmin();
    renderizarTabela();
}

function atualizarResumoMensal() {
    const ofertas = Object.values(ofertasMes || {}).filter(oferta =>
        oferta?.ativa !== false && oferta?.origem === 'frm_distribuicao');
    const disponibilizadas = ofertas.reduce((total, oferta) => total + Number(oferta.vagas_total || 0), 0);
    const utilizadas = ofertas.reduce((total, oferta) => total + Number(oferta.vagas_ocupadas || 0), 0);
    const pendentes = Math.max(0, disponibilizadas - utilizadas);

    const total = document.getElementById('totalVagasOficiais');
    const usadas = document.getElementById('totalUtilizadasOficiais');
    const restantes = document.getElementById('totalPendentesOficiais');
    if (total) total.textContent = String(disponibilizadas);
    if (usadas) usadas.textContent = String(utilizadas);
    if (restantes) restantes.textContent = String(pendentes);
}

function renderizarOfertasAdmin() {
    const card = document.getElementById('cardOfertasOficiaisAdmin');
    const corpo = document.getElementById('ofertasOficiaisAdminBody');
    if (!card || !corpo) return;
    card.classList.remove('d-none');

    const ofertas = Object.entries(ofertasMes || {})
        .filter(([, oferta]) => oferta?.ativa !== false && oferta?.origem === 'frm_distribuicao')
        .sort(([, a], [, b]) => String(a.nome_exibicao || '').localeCompare(String(b.nome_exibicao || ''), 'pt-BR'));

    if (!ofertas.length) {
        corpo.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Nenhuma vaga cadastrada neste mês.</td></tr>';
        return;
    }

    corpo.innerHTML = ofertas.map(([id, oferta]) => {
        const total = Number(oferta.vagas_total || 0);
        const utilizadas = Number(oferta.vagas_ocupadas || 0);
        return `<tr>
            <td>${escaparHTML(oferta.nome_exibicao || oferta.composicao_nome)}</td>
            <td class="text-center">${total}</td>
            <td class="text-center">${utilizadas}</td>
            <td class="text-center">${Math.max(0, total - utilizadas)}</td>
        </tr>`;
    }).join('');
}

function preencherOfertas() {
    const select = document.getElementById('selectOfertaOficial');
    if (!select) return;
    const opcoes = Object.entries(ofertasMes)
        .filter(([, oferta]) => oferta?.ativa !== false && oferta?.origem === 'frm_distribuicao' &&
            Number(oferta?.vagas_ocupadas || 0) < Number(oferta?.vagas_total || 0))
        .sort(([, a], [, b]) => String(a.nome_exibicao).localeCompare(String(b.nome_exibicao), 'pt-BR'));
    select.innerHTML = '<option value="">Selecione...</option>' + opcoes.map(([id, oferta]) => {
        const restantes = Number(oferta.vagas_total || 0) - Number(oferta.vagas_ocupadas || 0);
        return `<option value="${escaparHTML(id)}">${escaparHTML(oferta.nome_exibicao)} (${restantes} disponível(is))</option>`;
    }).join('');
    void preencherLocais();
}

async function preencherLocais(valorSelecionado = '') {
    const sequencia = ++sequenciaCarregamentoLocais;
    const oferta = ofertasMes[document.getElementById('selectOfertaOficial')?.value];
    const select = document.getElementById('selectLocalOficial');
    if (!select) return;
    locaisOfertaAtual = {};

    if (!oferta) {
        select.disabled = true;
        select.innerHTML = '<option value="">Selecione primeiro o tipo de escala</option>';
        return;
    }

    select.disabled = true;
    select.innerHTML = '<option value="">Carregando locais...</option>';
    const chave = oferta.composicao_chave || chaveComposicaoOficial(oferta.composicao_nome);
    let locais = {};

    try {
        if (chave) {
            const snapshot = await get(ref(database, `dejemOficiais/locaisPorComposicao/${chave}`));
            if (snapshot.exists()) locais = snapshot.val() || {};
        }
    } catch (error) {
        console.error('Erro ao carregar os locais da composição:', error);
    }

    if (!Object.keys(locais).length && oferta.locais) {
        locais = oferta.locais;
    }
    if (sequencia !== sequenciaCarregamentoLocais) return;

    locaisOfertaAtual = locais;
    const listaLocais = Object.values(locais).sort((a, b) =>
        String(a.opm_nome).localeCompare(String(b.opm_nome), 'pt-BR'));
    select.innerHTML = '<option value="">Selecione...</option>' + listaLocais.map(local =>
        `<option value="${escaparHTML(`${local.opm_codigo}_${local.composicao_cod}`)}">${escaparHTML(local.opm_nome)} - ${escaparHTML(local.composicao_cod)}</option>`
    ).join('');
    select.disabled = false;
    if (valorSelecionado && locaisOfertaAtual[valorSelecionado]) {
        select.value = valorSelecionado;
    }
}

function renderizarTabela() {
    const corpo = document.getElementById('dejemOficiaisBody');
    if (!corpo) return;
    const filtroMilitar = normalizarTexto(document.getElementById('filtroMilitarOficiais')?.value);
    const escolhasDoMes = Object.values(escolhasMes || {}).sort((a, b) =>
        `${a.data || ''} ${a.horario_inicial || ''}`.localeCompare(`${b.data || ''} ${b.horario_inicial || ''}`));
    const escolhas = escolhasDoMes.filter(escolha => {
        if (!filtroMilitar) return true;
        const pesquisa = normalizarTexto([
            escolha.oficial_re,
            escolha.oficial_nome,
            escolha.oficial_nome_exibicao
        ].join(' '));
        return pesquisa.includes(filtroMilitar);
    });

    if (!escolhas.length) {
        corpo.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">${
            escolhasDoMes.length
                ? 'Nenhum Oficial encontrado para o filtro informado.'
                : 'Nenhuma escolha cadastrada neste mês.'
        }</td></tr>`;
        return;
    }

    corpo.innerHTML = escolhas.map((escolha, indice) => {
        const [rotulo, cor] = STATUS[escolha.status] || [escolha.status || '-', 'secondary'];
        const podeAlterar = escolha.status === 'aguardando' &&
            (acessoAtual.administrador || String(escolha.oficial_re) === acessoAtual.re);
        const dataExibicao = dataComDiaSemana(escolha.data);
        const classeCor = ehFimDeSemana(escolha.data)
            ? 'dejem-oficiais-fim-semana'
            : (indice % 2 === 0 ? 'dejem-oficiais-linha-branca' : 'dejem-oficiais-linha-cinza');
        const linhaHoje = escolha.data === hojeBrasilISO() ? ' dejem-oficiais-hoje' : '';
        return `<tr class="${classeCor}${linhaHoje}">
            <td><div>${escaparHTML(dataExibicao.data)}</div><small class="text-muted">${escaparHTML(dataExibicao.diaSemana)}</small></td>
            <td>${escaparHTML(escolha.horario_inicial)}</td>
            <td>${escaparHTML(escolha.horario_final)}</td>
            <td>${escaparHTML(militarFormatado(escolha))}</td>
            <td>${escaparHTML(escolha.opm_nome || escolha.oficial_opm || '-')}</td>
            <td>${escaparHTML(escolha.composicao_cod || '-')}</td>
            <td>${escaparHTML(escolha.Prazo_Inscricao || '-')}</td>
            <td>${escaparHTML(escolha.ID_Escala || '-')}</td>
            <td><span class="badge text-bg-${cor}">${escaparHTML(rotulo)}</span></td>
            <td class="text-nowrap">${podeAlterar ? `
                <button class="btn btn-sm btn-outline-primary btn-editar-escolha" data-id="${escaparHTML(escolha.ID_Cadastro)}" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger btn-excluir-escolha" data-id="${escaparHTML(escolha.ID_Cadastro)}" title="Excluir"><i class="fas fa-trash"></i></button>` : '-'}</td>
        </tr>`;
    }).join('');
}

async function buscarOficialAdmin() {
    const re = String(document.getElementById('inputREOficialAdmin').value || '').replace(/\D/g, '');
    const resultado = document.getElementById('oficialAdminEncontrado');
    oficialAdminSelecionado = null;
    if (!/^\d{6}$/.test(re)) {
        resultado.textContent = 'Informe um RE com exatamente 6 dígitos.';
        return;
    }
    resultado.textContent = 'Consultando...';
    const militar = await obterMilitarGeral(re, true);
    if (!militar) {
        resultado.textContent = 'Militar não encontrado no Firebase Geral.';
        return;
    }
    if (!postoEhOficial(militar.post_grad)) {
        resultado.textContent = 'O RE informado não pertence a um Oficial.';
        return;
    }
    oficialAdminSelecionado = militar;
    resultado.textContent = `${militar.post_grad} ${militar.re} ${militar.nome_completo || militar.nome_exibicao}`;
}

function obterLocalSelecionado() {
    return locaisOfertaAtual[document.getElementById('selectLocalOficial').value] || null;
}

function montarDadosEscolha(ofertaId, oferta, local, militar, escolhaAnterior = null) {
    const data = document.getElementById('inputDataOficial').value;
    const horarioInicial = document.getElementById('inputHoraInicialOficial').value;
    const horarioFinal = somarOitoHoras(horarioInicial);
    const [ano, mes, dia] = data.split('-');
    const idFirebase = `${ano}/${mes}/${local.opm_codigo}/${local.composicao_cod}/${dia}${horarioInicial.replace(':', '')}`;
    const idCadastro = idFirebase.replaceAll('/', '');
    const agora = new Date().toISOString();

    return {
        ID_Cadastro: idCadastro,
        ID_Firebase: idFirebase,
        mes_ref: `${ano}-${mes}`,
        oferta_id: ofertaId,
        composicao_nome: oferta.composicao_nome,
        nome_exibicao: oferta.nome_exibicao,
        composicao_cod: local.composicao_cod,
        opm_codigo: local.opm_codigo,
        opm_nome: local.opm_nome,
        data,
        horario_inicial: horarioInicial,
        horario_final: horarioFinal,
        oficial_re: militar.re,
        oficial_nome: militar.nome_completo,
        oficial_nome_exibicao: militar.nome_exibicao,
        oficial_post_grad: militar.post_grad,
        categoria_oficial: categoriaPorPosto(militar.post_grad),
        oficial_opm: militar.opm,
        status: 'aguardando',
        criado_por_re: escolhaAnterior?.criado_por_re || acessoAtual.re,
        criado_em: escolhaAnterior?.criado_em || agora,
        atualizado_por_re: acessoAtual.re,
        atualizado_em: agora
    };
}

function montarSolicitacao(escolha) {
    return {
        data: escolha.data,
        opm_codigo: escolha.opm_codigo,
        opm_nome: escolha.opm_nome,
        composicao_cod: escolha.composicao_cod,
        composicao_nome: escolha.composicao_nome,
        horario_inicial: escolha.horario_inicial,
        horario_final: escolha.horario_final,
        ...quantidadesPorPosto(escolha.oficial_post_grad),
        ID_Firebase: escolha.ID_Firebase,
        necessidade: 'viatura_extra',
        motivo: 'Escolha de DEJEM por Oficial',
        observacoes: '',
        comprovante_anexo: null,
        criado_por_re: escolha.oficial_re,
        criado_por_nome: escolha.oficial_nome,
        criado_em: escolha.criado_em,
        origem: 'dejem_oficiais',
        id_escolha_oficial: escolha.ID_Cadastro,
        oficial_re: escolha.oficial_re,
        oficial_post_grad: escolha.oficial_post_grad,
        categoria_oficial: escolha.categoria_oficial || categoriaPorPosto(escolha.oficial_post_grad)
    };
}

async function reservarEscolha(escolha, anterior = null) {
    const chaveMesNova = escolha.mes_ref.replace('-', '');
    const chaveMesAntiga = anterior?.mes_ref?.replace('-', '');
    let motivoFalha = '';
    const mesmaOferta = Boolean(anterior && anterior.oferta_id === escolha.oferta_id && chaveMesAntiga === chaveMesNova);
    const ofertaNovaRef = ref(database, `dejemOficiais/ofertas/${chaveMesNova}/${escolha.oferta_id}`);
    const escolhaNovaRef = ref(database, `dejemOficiais/escolhas/${chaveMesNova}/${escolha.ID_Cadastro}`);
    const tokenReserva = `${acessoAtual.re}_${Date.now()}`;
    const mudouIdentificador = Boolean(anterior &&
        (anterior.ID_Cadastro !== escolha.ID_Cadastro || chaveMesAntiga !== chaveMesNova));

    const ofertaServidorSnap = await get(ofertaNovaRef);
    const ofertaServidor = ofertaServidorSnap.exists() ? ofertaServidorSnap.val() : null;
    if (!ofertaServidor || ofertaServidor.ativa === false || ofertaServidor.origem !== 'frm_distribuicao') {
        throw new Error('Esta vaga não está mais disponível. Atualize a página e escolha novamente.');
    }
    if (!mesmaOferta && Number(ofertaServidor.vagas_ocupadas || 0) >= Number(ofertaServidor.vagas_total || 0)) {
        throw new Error('Todas as vagas deste tipo de DEJEM já foram preenchidas.');
    }

    if (mudouIdentificador) {
        const escolhaAntigaRef = ref(
            database,
            `dejemOficiais/escolhas/${chaveMesAntiga}/${anterior.ID_Cadastro}`
        );
        const escolhaServidorSnap = await get(escolhaAntigaRef);
        const escolhaServidor = escolhaServidorSnap.exists() ? escolhaServidorSnap.val() : null;
        if (!escolhaServidor || escolhaServidor.status !== 'aguardando') {
            throw new Error('Esta escolha começou a ser importada e não pode mais ser alterada.');
        }

        let edicaoBloqueada = false;
        const bloqueio = await runTransaction(
            escolhaAntigaRef,
            atual => {
                // A primeira execução pode receber o cache local vazio.
                if (!atual) atual = JSON.parse(JSON.stringify(escolhaServidor));
                if (!atual || atual.status !== 'aguardando') {
                    edicaoBloqueada = true;
                    return;
                }
                return { ...atual, status: 'editando', reserva_token: tokenReserva };
            }
        );
        if (!bloqueio.committed || edicaoBloqueada) {
            throw new Error('Esta escolha começou a ser importada e não pode mais ser alterada.');
        }
    }

    const reivindicacao = await runTransaction(escolhaNovaRef, atual => {
        const atualEhEdicao = anterior && atual?.ID_Cadastro === anterior.ID_Cadastro &&
            atual?.status === 'aguardando' && String(atual?.oficial_re) === String(anterior.oficial_re);
        if (atual && !atualEhEdicao) {
            motivoFalha = 'Já existe uma escolha para este local, data e horário.';
            return;
        }
        return { ...escolha, status: 'reservando', reserva_token: tokenReserva };
    });
    if (!reivindicacao.committed) {
        if (mudouIdentificador) {
            await set(ref(database, `dejemOficiais/escolhas/${chaveMesAntiga}/${anterior.ID_Cadastro}`), anterior);
        }
        throw new Error(motivoFalha || 'O horário acabou de ser reservado por outro Oficial.');
    }

    const resultado = await runTransaction(ofertaNovaRef, ofertaNova => {
        // A primeira execução pode receber o cache local vazio antes da comparação com o servidor.
        if (!ofertaNova || ofertaNova.origem === undefined) {
            ofertaNova = JSON.parse(JSON.stringify(ofertaServidor));
        }
        if (ofertaNova.ativa === false) {
            motivoFalha = 'Esta vaga foi encerrada e não está mais disponível.';
            return;
        }
        if (ofertaNova.origem !== 'frm_distribuicao') {
            motivoFalha = 'Esta vaga pertence a uma distribuição antiga. Atualize a página e escolha novamente.';
            return;
        }
        const ocupadas = Number(ofertaNova.vagas_ocupadas || 0);
        if (!mesmaOferta && ocupadas >= Number(ofertaNova.vagas_total || 0)) {
            motivoFalha = 'Todas as vagas deste tipo de DEJEM já foram preenchidas.';
            return;
        }
        ofertaNova.reservas ||= {};
        if (mesmaOferta && anterior.ID_Cadastro !== escolha.ID_Cadastro) {
            delete ofertaNova.reservas[anterior.ID_Cadastro];
        }
        ofertaNova.reservas[escolha.ID_Cadastro] = { oficial_re: escolha.oficial_re, atualizado_em: escolha.atualizado_em };
        if (!mesmaOferta) ofertaNova.vagas_ocupadas = ocupadas + 1;
        return ofertaNova;
    });
    if (!resultado.committed) {
        if (anterior && anterior.ID_Cadastro === escolha.ID_Cadastro && chaveMesAntiga === chaveMesNova) {
            await set(escolhaNovaRef, anterior);
        } else {
            await remove(escolhaNovaRef);
        }
        if (mudouIdentificador) {
            await set(ref(database, `dejemOficiais/escolhas/${chaveMesAntiga}/${anterior.ID_Cadastro}`), anterior);
        }
        throw new Error(motivoFalha || 'Não foi possível reservar a vaga. Tente novamente.');
    }

    try {
        const escolhasAtualizacoes = {};
        if (anterior && (chaveMesAntiga !== chaveMesNova || anterior.ID_Cadastro !== escolha.ID_Cadastro)) {
            escolhasAtualizacoes[`dejemOficiais/escolhas/${chaveMesAntiga}/${anterior.ID_Cadastro}`] = null;
        }
        escolhasAtualizacoes[`dejemOficiais/escolhas/${chaveMesNova}/${escolha.ID_Cadastro}`] = escolha;
        await update(ref(database), escolhasAtualizacoes);

        if (anterior && !mesmaOferta) {
            await liberarReservaOferta(chaveMesAntiga, anterior.oferta_id, anterior.ID_Cadastro);
        }
    } catch (error) {
        await liberarReservaOferta(chaveMesNova, escolha.oferta_id, escolha.ID_Cadastro);
        if (anterior && anterior.ID_Cadastro === escolha.ID_Cadastro && chaveMesAntiga === chaveMesNova) {
            await set(escolhaNovaRef, anterior);
        } else {
            await remove(escolhaNovaRef);
        }
        if (mudouIdentificador) {
            await set(ref(database, `dejemOficiais/escolhas/${chaveMesAntiga}/${anterior.ID_Cadastro}`), anterior);
        }
        throw error;
    }
}

async function liberarReservaOferta(chaveMes, ofertaId, idCadastro) {
    if (!chaveMes || !ofertaId || !idCadastro) return;
    await runTransaction(ref(database, `dejemOficiais/ofertas/${chaveMes}/${ofertaId}`), oferta => {
        if (!oferta?.reservas?.[idCadastro]) return oferta;
        delete oferta.reservas[idCadastro];
        oferta.vagas_ocupadas = Math.max(0, Number(oferta.vagas_ocupadas || 0) - 1);
        return oferta;
    });
}

async function salvarEscolha(evento) {
    evento.preventDefault();
    limparMensagem();
    const idAnterior = document.getElementById('idEscolhaOficial').value;
    const anterior = idAnterior ? escolhasMes[idAnterior] : null;
    if (anterior && anterior.status !== 'aguardando') {
        mostrarMensagem('Esta escolha já foi importada e não pode mais ser alterada.', 'warning');
        return;
    }

    const ofertaId = document.getElementById('selectOfertaOficial').value;
    const oferta = ofertasMes[ofertaId];
    const local = obterLocalSelecionado();
    const data = document.getElementById('inputDataOficial').value;
    const hora = document.getElementById('inputHoraInicialOficial').value;
    const militar = acessoAtual.administrador ? oficialAdminSelecionado : acessoAtual.militar;
    if (!oferta || !local || !data || !hora || !militar?.oficial) {
        mostrarMensagem('Preencha todos os campos e identifique corretamente o Oficial.', 'warning');
        return;
    }
    if (!data.startsWith(`${mesAtual}-`)) {
        mostrarMensagem(`A data deve pertencer a ${nomeMes(mesAtual)}.`, 'warning');
        return;
    }

    const botao = document.getElementById('btnSalvarEscolhaOficial');
    botao.disabled = true;
    try {
        const escolha = montarDadosEscolha(ofertaId, oferta, local, militar, anterior);
        await reservarEscolha(escolha, anterior);
        const atualizacoes = {};
        if (anterior && anterior.ID_Firebase !== escolha.ID_Firebase) {
            atualizacoes[`solicitacoes/${anterior.ID_Firebase}`] = null;
            atualizacoes[`SolicPendentes/${anterior.ID_Firebase}`] = null;
        }
        atualizacoes[`solicitacoes/${escolha.ID_Firebase}`] = montarSolicitacao(escolha);
        atualizacoes[`SolicPendentes/${escolha.ID_Firebase}`] = {
            ID_Firebase: escolha.ID_Firebase, atualizado_em: serverTimestamp()
        };
        await update(ref(database), atualizacoes);
        limparFormulario();
        await carregarMes();
        mostrarMensagem(anterior ? 'Escolha alterada com sucesso.' : 'Escolha cadastrada com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao salvar solicitação de Oficial:', error);
        mostrarMensagem(error.message || 'Não foi possível salvar a escolha.', 'danger');
    } finally {
        botao.disabled = false;
    }
}

async function editarEscolha(idCadastro) {
    const escolha = escolhasMes[idCadastro];
    if (!escolha || escolha.status !== 'aguardando') return;
    document.getElementById('idEscolhaOficial').value = escolha.ID_Cadastro;
    document.getElementById('selectOfertaOficial').value = escolha.oferta_id;
    await preencherLocais(`${escolha.opm_codigo}_${escolha.composicao_cod}`);
    document.getElementById('inputDataOficial').value = escolha.data;
    document.getElementById('inputHoraInicialOficial').value = escolha.horario_inicial;
    document.getElementById('inputHoraFinalOficial').value = escolha.horario_final;
    if (acessoAtual.administrador) {
        document.getElementById('inputREOficialAdmin').value = escolha.oficial_re;
        obterMilitarGeral(escolha.oficial_re).then(militar => {
            oficialAdminSelecionado = militar;
            document.getElementById('oficialAdminEncontrado').textContent = militar
                ? `${militar.post_grad} ${militar.re} ${militar.nome_completo || militar.nome_exibicao}` : 'Oficial não encontrado.';
        });
    }
    document.getElementById('btnCancelarEdicaoOficial').classList.remove('d-none');
    document.getElementById('btnSalvarEscolhaOficial').innerHTML = '<i class="fas fa-save me-1"></i>Salvar alteração';
    document.getElementById('formEscolhaOficial').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirEscolha(idCadastro) {
    const escolha = escolhasMes[idCadastro];
    if (!escolha || escolha.status !== 'aguardando') return;
    if (!confirm(`Excluir a escolha de ${militarFormatado(escolha)}?`)) return;

    const chaveMes = escolha.mes_ref.replace('-', '');
    const escolhaRef = ref(database, `dejemOficiais/escolhas/${chaveMes}/${idCadastro}`);
    const servidorSnapshot = await get(escolhaRef);
    const escolhaServidor = servidorSnapshot.exists() ? servidorSnapshot.val() : null;
    if (!escolhaServidor) {
        mostrarMensagem('A escolha já não existe no Firebase. A lista será atualizada.', 'info');
        await carregarMes();
        return;
    }
    if (escolhaServidor.status !== 'aguardando') {
        mostrarMensagem('A escolha já foi importada e não pode mais ser excluída.', 'warning');
        await carregarMes();
        return;
    }

    let bloqueada = false;
    const exclusao = await runTransaction(escolhaRef, atual => {
        if (!atual) atual = JSON.parse(JSON.stringify(escolhaServidor));
        if (!atual || atual.status !== 'aguardando') {
            bloqueada = true;
            return;
        }
        return null;
    });
    if (!exclusao.committed || bloqueada) {
        mostrarMensagem('A escolha já foi importada e não pode mais ser excluída.', 'warning');
        return;
    }
    await liberarReservaOferta(chaveMes, escolha.oferta_id, idCadastro);
    await update(ref(database), {
        [`solicitacoes/${escolha.ID_Firebase}`]: null,
        [`SolicPendentes/${escolha.ID_Firebase}`]: null
    });
    await carregarMes();
    mostrarMensagem('Escolha excluída com sucesso.', 'success');
}

function limparFormulario() {
    document.getElementById('formEscolhaOficial')?.reset();
    document.getElementById('idEscolhaOficial').value = '';
    document.getElementById('inputHoraFinalOficial').value = '';
    document.getElementById('btnCancelarEdicaoOficial').classList.add('d-none');
    document.getElementById('btnSalvarEscolhaOficial').innerHTML = '<i class="fas fa-check me-1"></i>Confirmar escolha';
    oficialAdminSelecionado = acessoAtual?.administrador ? null : acessoAtual?.militar;
    if (acessoAtual?.administrador) {
        document.getElementById('oficialAdminEncontrado').textContent = 'Informe o RE do Oficial.';
    }
    void preencherLocais();
}

function configurarEventos() {
    eventos?.abort();
    eventos = new AbortController();
    const sinal = { signal: eventos.signal };
    document.getElementById('selectMesOficiais')?.addEventListener('change', async evento => {
        mesAtual = evento.target.value;
        limparFormulario();
        document.getElementById('inputDataOficial').min = `${mesAtual}-01`;
        document.getElementById('inputDataOficial').max = `${mesAtual}-31`;
        await carregarMes();
    }, sinal);
    document.getElementById('selectOfertaOficial')?.addEventListener('change', () => {
        preencherLocais().catch(error => {
            console.error('Erro ao atualizar os locais da composição:', error);
        });
    }, sinal);
    document.getElementById('filtroMilitarOficiais')?.addEventListener('input', renderizarTabela, sinal);
    document.getElementById('inputHoraInicialOficial')?.addEventListener('input', evento => {
        document.getElementById('inputHoraFinalOficial').value = somarOitoHoras(evento.target.value);
    }, sinal);
    document.getElementById('formEscolhaOficial')?.addEventListener('submit', salvarEscolha, sinal);
    document.getElementById('btnCancelarEdicaoOficial')?.addEventListener('click', limparFormulario, sinal);
    document.getElementById('btnBuscarOficialAdmin')?.addEventListener('click', buscarOficialAdmin, sinal);
    document.getElementById('dejemOficiaisBody')?.addEventListener('click', evento => {
        const editar = evento.target.closest('.btn-editar-escolha');
        const excluir = evento.target.closest('.btn-excluir-escolha');
        if (editar) editarEscolha(editar.dataset.id).catch(error => {
            console.error('Erro ao preparar a edição da escolha de Oficial:', error);
            mostrarMensagem('Não foi possível carregar os locais desta escolha.', 'danger');
        });
        if (excluir) excluirEscolha(excluir.dataset.id).catch(error => {
            console.error('Erro ao excluir escolha de Oficial:', error);
            mostrarMensagem('Não foi possível excluir a escolha.', 'danger');
        });
    }, sinal);
}

export async function initDejemOficiais() {
    try {
        const { userData, re } = await checkAuth(3);
        acessoAtual = await obterAcessoDejemOficiais(userData, re);
        if (!acessoAtual.permitido) {
            mostrarMensagem('Esta página é exclusiva para administradores e Oficiais.', 'danger');
            setTimeout(() => {
                if (window.app?.loadPage) {
                    window.app.loadPage('dashboard.html');
                } else {
                    window.location.href = 'app.html';
                }
            }, 1200);
            return;
        }

        preencherMeses();
        configurarEventos();
        oficialAdminSelecionado = acessoAtual.administrador ? null : acessoAtual.militar;
        document.getElementById('grupoOficialAdmin').classList.toggle('d-none', !acessoAtual.administrador);
        document.getElementById('inputDataOficial').min = `${mesAtual}-01`;
        document.getElementById('inputDataOficial').max = `${mesAtual}-31`;
        await carregarMes();
    } catch (error) {
        console.error('Erro ao carregar a DEJEM dos Oficiais:', error);
        mostrarMensagem(error.message || 'Não foi possível carregar a página.', 'danger');
    }
}

if (!window.location.pathname.includes('app.html') && !document.getElementById('app-content')) {
    document.addEventListener('DOMContentLoaded', async () => {
        await loadNavbar();
        await initDejemOficiais();
    });
}
