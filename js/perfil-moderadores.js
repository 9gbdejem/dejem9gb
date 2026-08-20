import { app, database } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

const GRUPOS = [
    { chave: '1SGB', titulo: '1º SGB', origem: 'Solic_Moderador' },
    { chave: '2SGB', titulo: '2º SGB', origem: 'Solic_Moderador_2SGB' },
    { chave: '3SGB', titulo: '3º SGB', origem: 'Solic_Moderador_3SGB' },
    { chave: '4SGB', titulo: '4º SGB', origem: 'Solic_Moderador_4SGB' }
];
let authSecundario;

export async function initModeradores() {
    const area = document.getElementById('perfil-conteudo-dinamico');
    area.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h4>Moderadores</h4><button class="btn btn-primary" id="btnCadastrarModeradores">Cadastrar selecionados</button></div><div id="moderadoresMensagem"></div><div id="moderadoresTabelas"><div class="text-center py-4"><div class="spinner-border"></div></div></div>`;
    document.getElementById('btnCadastrarModeradores').addEventListener('click', cadastrarSelecionados);
    await carregarTabelas();
}

async function carregarTabelas() {
    const dados = await Promise.all(GRUPOS.map(async grupo => {
        const [origem, feitos] = await Promise.all([get(ref(database, grupo.origem)), get(ref(database, `Moderadores_Cadastrados/${grupo.chave}`))]);
        return { grupo, origem: origem.val() || {}, feitos: feitos.val() || {} };
    }));
    document.getElementById('moderadoresTabelas').innerHTML = dados.map(({ grupo, origem, feitos }) => {
        const lista = Object.entries(origem).sort((a, b) => String(a[1]?.nome_completo || '').localeCompare(String(b[1]?.nome_completo || ''), 'pt-BR'));
        return `<section class="card mb-3"><div class="card-header fw-bold">${esc(grupo.titulo)} <span class="badge bg-secondary">${lista.length}</span></div><div class="table-responsive"><table class="table table-sm table-hover mb-0"><thead><tr><th><input type="checkbox" class="selecionar-grupo" data-grupo="${grupo.chave}"></th><th>RE</th><th>Nome</th><th>Posto/Grad</th><th>OPM</th><th>E-mail</th><th>Situação</th></tr></thead><tbody>${lista.length ? lista.map(([re, item]) => { const feito = Boolean(feitos[re]); return `<tr><td>${feito ? '' : `<input type="checkbox" class="selecionar-moderador" data-grupo="${grupo.chave}" data-re="${esc(re)}">`}</td><td>${esc(re)}</td><td>${esc(item.nome_completo || item.nome)}</td><td>${esc(item.post_grad || item.posto_grad)}</td><td>${esc(item.opm)}</td><td>${esc(item.mail_funcional || item.email)}</td><td>${feito ? '<span class="text-success fw-bold">✅ Criado</span>' : 'Pendente'}</td></tr>`; }).join('') : '<tr><td colspan="7" class="text-center text-muted">Nenhum moderador encontrado.</td></tr>'}</tbody></table></div></section>`;
    }).join('');
    document.querySelectorAll('.selecionar-grupo').forEach(c => c.addEventListener('change', () => document.querySelectorAll(`.selecionar-moderador[data-grupo="${c.dataset.grupo}"]`).forEach(x => x.checked = c.checked)));
}

async function cadastrarSelecionados() {
    const selecionados = [...document.querySelectorAll('.selecionar-moderador:checked')];
    if (!selecionados.length) return mostrarMensagem('Selecione pelo menos um moderador.', 'warning');
    if (!confirm(`Cadastrar ${selecionados.length} moderador(es)?`)) return;
    const origem = new Map();
    for (const grupo of GRUPOS) { const snap = await get(ref(database, grupo.origem)); Object.entries(snap.val() || {}).forEach(([re, item]) => origem.set(`${grupo.chave}/${re}`, { grupo, re, item })); }
    const botao = document.getElementById('btnCadastrarModeradores'); botao.disabled = true;
    try { for (const c of selecionados) { const dado = origem.get(`${c.dataset.grupo}/${c.dataset.re}`); if (dado) await cadastrarUm(dado.grupo, dado.re, dado.item); } mostrarMensagem('Cadastro concluído.', 'success'); await carregarTabelas(); }
    catch (error) { console.error('Erro ao cadastrar moderadores:', error); mostrarMensagem(error.message, 'danger'); }
    finally { botao.disabled = false; }
}

async function cadastrarUm(grupo, re, item) {
    const email = String(item.mail_funcional || item.email || '').trim().toLowerCase();
    if (!email) throw new Error(`O RE ${re} não possui e-mail funcional.`);
    const login = (await get(ref(database, `login/${re}`))).val() || {};
    let uid = login.uid || '';
    let contaNova = false;
    if (!uid) { try { const cred = await createUserWithEmailAndPassword(getAuthSecundario(), email, gerarSenha()); uid = cred.user.uid; contaNova = true; await sendPasswordResetEmail(getAuthSecundario(), email); await signOut(getAuthSecundario()).catch(() => {}); } catch (error) { if (error.code !== 'auth/email-already-in-use') throw error; } }
    const agora = new Date().toISOString();
    await set(ref(database, `login/${re}`), { ...login, re: String(re), uid: uid || null, nome_completo: item.nome_completo || item.nome || '', mail_funcional: email, nivel: Number(login.nivel || 2), criado_em: login.criado_em || agora, atualizado_em: agora });
    if (uid) await set(ref(database, `usuariosPorUid/${uid}`), { re: String(re), nivel: Number(login.nivel || 2), mail_funcional: email, nome_completo: item.nome_completo || item.nome || '', atualizado_em: agora });
    await set(ref(database, `Moderadores_Cadastrados/${grupo.chave}/${re}`), { re: String(re), sgb: grupo.chave, uid: uid || null, criado_em: agora, atualizado_em: agora });
}

function getAuthSecundario() { if (authSecundario) return authSecundario; const nome = 'moderadores-create-user'; const appSecundario = getApps().find(x => x.name === nome) || initializeApp(app.options, nome); authSecundario = getAuth(appSecundario); return authSecundario; }
function gerarSenha() { const bytes = new Uint8Array(24); crypto.getRandomValues(bytes); return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('') + 'A1!'; }
function mostrarMensagem(texto, tipo) { document.getElementById('moderadoresMensagem').innerHTML = `<div class="alert alert-${tipo}">${esc(texto)}</div>`; }
function esc(valor) { return String(valor || '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[x])); }
