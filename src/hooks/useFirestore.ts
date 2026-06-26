import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';

export function useFirestore<T extends { id: string }>(collectionName: string, userId?: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const q = query(collection(db, collectionName), where("userId", "==", userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: T[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as T);
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching ${collectionName}:`, error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [collectionName, userId]);

  const addOrUpdateItem = async (item: T) => {
    if (!userId) return;
    try {
      await setDoc(doc(db, collectionName, item.id), { ...item, userId });
    } catch (error) {
      console.error(`Error adding/updating ${collectionName}:`, error);
      throw error;
    }
  };

  const removeItem = async (id: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      console.error(`Error removing ${collectionName}:`, error);
      throw error;
    }
  };
  
  const batchReplaceAll = async (items: T[]) => {
    if (!userId) return;
    try {
      const batch = writeBatch(db);
      // Not actually replacing all, just upserting all items for simplicity 
      // in a simple migration.
      items.forEach(item => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, { ...item, userId });
      });
      await batch.commit();
    } catch (error) {
      console.error(`Error batch replacing ${collectionName}:`, error);
      throw error;
    }
  }

  return { data, loading, addOrUpdateItem, removeItem, batchReplaceAll };
}
