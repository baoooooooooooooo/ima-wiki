import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 👇 파이어베이스 콘솔에서 복사한 firebaseConfig 코드를 아래에 그대로 덮어씌우세요! 👇
const firebaseConfig = {
  apiKey: "AIzaSyDcCpGeomIbph3f2TxTLGUaRnXIQxESVxI",
  authDomain: "jandiwiki-4bd5e.firebaseapp.com",
  projectId: "jandiwiki-4bd5e",
  storageBucket: "jandiwiki-4bd5e.firebasestorage.app",
  messagingSenderId: "517095280452",
  appId: "1:517095280452:web:69a3284f16d118fbdb9111",
  measurementId: "G-DHL7LRWH5G"
};
// 👆 ------------------------------------------------------------------------- 👆

// Firebase 초기화 및 Firestore DB 연결
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
