// main.js
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

// Carrega dados do usuário
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userSnapshot = await get(ref(database, `usuarios/${user.uid}`));
        
        if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            document.getElementById('userName').textContent = userData.nome;
            document.getElementById('userRE').textContent = userData.re;
            document.getElementById('userEmail').textContent = userData.email;
        }
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