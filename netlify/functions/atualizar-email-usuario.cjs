const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const crypto = require('crypto');

const PROJECT_ID = 'dejem-9gb';
const DATABASE_URL = 'https://dejem-9gb-default-rtdb.firebaseio.com';

function resposta(statusCode, corpo) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(corpo)
    };
}

function obterAplicativoAdmin() {
    if (getApps().length) return getApps()[0];

    const projectId = String(process.env.DEJEM_FIREBASE_PROJECT_ID || '').trim();
    const clientEmail = String(process.env.DEJEM_FIREBASE_CLIENT_EMAIL || '').trim();
    const privateKeyBase64 = String(process.env.DEJEM_FIREBASE_PRIVATE_KEY_BASE64 || '').trim();

    if (!projectId || !clientEmail || !privateKeyBase64) {
        throw new Error(
            'As credenciais administrativas do Firebase DEJEM não estão configuradas na Netlify.'
        );
    }

    if (projectId !== PROJECT_ID || !clientEmail.endsWith(`@${PROJECT_ID}.iam.gserviceaccount.com`)) {
        throw new Error('As credenciais administrativas configuradas não pertencem ao projeto dejem-9gb.');
    }

    let privateKey;
    try {
        privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    } catch (error) {
        throw new Error('A chave administrativa do Firebase DEJEM está em formato inválido.');
    }

    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('A chave administrativa do Firebase DEJEM não é válida.');
    }

    return initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        databaseURL: process.env.DEJEM_FIREBASE_DATABASE_URL || DATABASE_URL
    });
}

async function obterREAdministrador(db, token) {
    const indiceSnapshot = await db.ref(`usuariosPorUid/${token.uid}/re`).once('value');
    if (indiceSnapshot.exists()) return String(indiceSnapshot.val()).trim();

    const email = String(token.email || '').trim().toLowerCase();
    if (!email) return '';

    const loginSnapshot = await db.ref('login').orderByChild('email').equalTo(email).once('value');
    const registros = loginSnapshot.val() || {};
    const res = Object.keys(registros);
    return res.length === 1 ? res[0] : '';
}

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return resposta(405, { erro: 'Método não permitido.' });
    }

    try {
        const aplicativo = obterAplicativoAdmin();
        const auth = getAuth(aplicativo);
        const db = getDatabase(aplicativo);

        const authorization = event.headers.authorization || event.headers.Authorization || '';
        const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
        if (!idToken) return resposta(401, { erro: 'Sessão não autenticada.' });

        const token = await auth.verifyIdToken(idToken, true);
        const reAdministrador = await obterREAdministrador(db, token);
        if (!reAdministrador) {
            return resposta(403, { erro: 'Não foi possível identificar o administrador autenticado.' });
        }

        await db.ref(`usuariosPorUid/${token.uid}`).update({
            re: reAdministrador,
            atualizado_em: new Date().toISOString()
        });

        const permissaoSnapshot = await db.ref(`permissoes/${reAdministrador}/nivel`).once('value');
        if (Number(permissaoSnapshot.val()) !== 1) {
            return resposta(403, { erro: 'Somente administradores de nível 1 podem alterar e-mails de acesso.' });
        }

        const dados = JSON.parse(event.body || '{}');
        const re = String(dados.re || '').trim();
        const emailAntigo = String(dados.emailAntigo || '').trim().toLowerCase();
        const emailNovo = String(dados.emailNovo || '').trim().toLowerCase();
        const nome = String(dados.nome || '').trim();

        if (!/^\d{6}$/.test(re)) return resposta(400, { erro: 'RE inválido.' });
        if (!emailAntigo || !emailNovo || !emailNovo.includes('@')) {
            return resposta(400, { erro: 'Informe o e-mail anterior e o novo e-mail.' });
        }
        if (emailAntigo === emailNovo) return resposta(200, { alterado: false });

        const [loginAlvoSnapshot, efetivoAlvoSnapshot] = await Promise.all([
            db.ref(`login/${re}`).once('value'),
            db.ref(`efetivo/${re}`).once('value')
        ]);
        const loginAlvo = loginAlvoSnapshot.val() || {};
        const efetivoAlvo = efetivoAlvoSnapshot.val() || {};
        const emailCadastrado = String(
            loginAlvo.email || efetivoAlvo.email || efetivoAlvo.mail_funcional || ''
        ).trim().toLowerCase();
        if (!emailCadastrado || emailCadastrado !== emailAntigo) {
            return resposta(409, {
                erro: 'O e-mail anterior não confere com o cadastro atual do RE informado. Pesquise o militar novamente.'
            });
        }

        const usuarioAlvo = await auth.getUserByEmail(emailAntigo);

        try {
            const usuarioDoNovoEmail = await auth.getUserByEmail(emailNovo);
            if (usuarioDoNovoEmail.uid !== usuarioAlvo.uid) {
                return resposta(409, { erro: 'O novo e-mail já pertence a outro usuário.' });
            }
        } catch (error) {
            if (error.code !== 'auth/user-not-found') throw error;
        }

        await auth.updateUser(usuarioAlvo.uid, {
            email: emailNovo,
            emailVerified: false
        });

        const agora = new Date().toISOString();
        const atualizacoes = {
            [`login/${re}/email`]: emailNovo,
            [`login/${re}/atualizado_em`]: agora,
            [`efetivo/${re}/email`]: emailNovo,
            [`efetivo/${re}/atualizado_em`]: agora,
            [`usuariosPorUid/${usuarioAlvo.uid}/re`]: re,
            [`usuariosPorUid/${usuarioAlvo.uid}/atualizado_em`]: agora
        };
        if (nome) {
            atualizacoes[`login/${re}/nome`] = nome;
            atualizacoes[`efetivo/${re}/nome`] = nome;
        }

        try {
            await db.ref().update(atualizacoes);
        } catch (error) {
            await auth.updateUser(usuarioAlvo.uid, {
                email: emailAntigo,
                emailVerified: false
            });
            throw new Error('A alteração foi desfeita porque não foi possível sincronizar o Realtime Database.');
        }

        let senhaAnteriorInvalidada = true;
        try {
            const senhaTemporaria = `${crypto.randomBytes(32).toString('base64url')}Aa1!`;
            await auth.updateUser(usuarioAlvo.uid, { password: senhaTemporaria });
            if (usuarioAlvo.uid !== token.uid) {
                await auth.revokeRefreshTokens(usuarioAlvo.uid);
            }
        } catch (error) {
            senhaAnteriorInvalidada = false;
            console.error('O e-mail foi alterado, mas a senha anterior não pôde ser invalidada:', error);
        }

        return resposta(200, {
            alterado: true,
            uid: usuarioAlvo.uid,
            re,
            senhaAnteriorInvalidada
        });
    } catch (error) {
        console.error('Erro ao atualizar e-mail do usuário:', error);

        if (error.code === 'auth/user-not-found') {
            return resposta(404, { erro: 'A conta correspondente ao e-mail anterior não foi encontrada no Authentication.' });
        }
        if (error.code === 'auth/email-already-exists') {
            return resposta(409, { erro: 'O novo e-mail já pertence a outro usuário.' });
        }
        if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired') {
            return resposta(401, { erro: 'A sessão expirou. Entre novamente no sistema.' });
        }

        return resposta(500, { erro: error.message || 'Não foi possível atualizar o e-mail.' });
    }
};
