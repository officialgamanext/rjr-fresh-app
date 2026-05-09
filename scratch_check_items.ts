
import { db } from './config/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function checkItems() {
  const snap = await getDocs(collection(db, 'items'));
  snap.forEach(doc => {
    console.log(`Item: ${doc.data().name}, Price: ${doc.data().price}, Type: ${typeof doc.data().price}`);
  });
}
checkItems();
