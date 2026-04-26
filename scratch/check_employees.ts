import { db } from './config/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

async function checkEmployees() {
  try {
    const q = query(collection(db, 'employees'), limit(5));
    const snap = await getDocs(q);
    snap.forEach(doc => {
      console.log('Employee ID:', doc.id, 'Data:', JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

checkEmployees();
