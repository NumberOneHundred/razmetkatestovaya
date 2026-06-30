import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update, remove } from "firebase/database";
const firebaseConfig = {
  apiKey: "AIzaSyB0kAvpc1JouqQp5Qthd33jYFv1n4KAjr4",
  authDomain: "scheme-editor-6e0c9.firebaseapp.com",
  databaseURL: "https://scheme-editor-6e0c9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "scheme-editor-6e0c9",
  storageBucket: "scheme-editor-6e0c9.firebasestorage.app",
  messagingSenderId: "867047557248",
  appId: "1:867047557248:web:b803fc2c3beb18bf18fe65"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
get(ref(db, "ann_users")).then(snap => {
  if (!snap.exists()) {
    set(ref(db, "ann_users/dronovva_yandex-team_ru"), {
      email: "dronovva@yandex-team.ru", name: "Менеджер", role: "manager"
    });
  }
});
export { db, ref, set, get, onValue, update, remove };
