// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3TXsO9TA_ZrxMzt_UqSu1f5mEpexjZkw",
  authDomain: "dejemdb.firebaseapp.com",
  databaseURL: "https://dejemdb-default-rtdb.firebaseio.com",
  projectId: "dejemdb",
  storageBucket: "dejemdb.firebasestorage.app",
  messagingSenderId: "75244392827",
  appId: "1:75244392827:web:53f6e521af50ee02352dde"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export { auth, database };