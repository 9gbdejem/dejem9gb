// lista-usuarios.js
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

// Carrega lista de usuários
async function carregarUsuarios() {
    try {
        const usersSnapshot = await get(ref(database, 'usuarios'));
        const tbody = document.querySelector('#usersTable tbody');
        
        if (usersSnapshot.exists()) {
            const users = usersSnapshot.val();
            tbody.innerHTML = '';
            
            Object.keys(users).forEach(re => {
                const user = users[re];
                const row = `
                    <tr>
                        <td>${user.re}</td>
                        <td>${user.nome}</td>
                        <td>${user.email}</td>
                        <td>${user.cpf}</td>
                        <td>${user.redefinirSenha ? 'Sim' : 'Não'}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

// Verifica autenticação
auth.onAuthStateChanged((user) => {
    if (user) {
        carregarUsuarios();
    } else {
        window.location.href = 'index.html';
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
    }
});