import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
  console.error('Firestore Error Details:', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

// Deep clean payload to remove undefined fields which cause Firestore errors
function sanitizePayload<T>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {};
  if (!obj || typeof obj !== 'object') return clean;
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizePayload(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

export function useFirestore<T extends { id: string }>(collectionName: string, userId?: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    const q = query(collection(db, collectionName), where("userId", "==", userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: T[] = [];
        snapshot.forEach((docSnapshot) => {
          items.push({ id: docSnapshot.id, ...docSnapshot.data() } as T);
        });
        setData(items);
        setLoading(false);
      },
      (err) => {
        const formattedErr = handleFirestoreError(err, OperationType.GET, collectionName);
        setError(formattedErr.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, userId]);

  const addOrUpdateItem = async (item: T) => {
    if (!userId) return;
    try {
      const sanitized = sanitizePayload({ ...item, userId });
      await setDoc(doc(db, collectionName, item.id), sanitized);
    } catch (err) {
      throw handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${item.id}`);
    }
  };

  const removeItem = async (id: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      throw handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
    }
  };
  
  // Scalable chunking for batch operations (max 400 writes per batch to respect 500 limit)
  const batchReplaceAll = async (items: T[]) => {
    if (!userId || items.length === 0) return;
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const docRef = doc(db, collectionName, item.id);
          const sanitized = sanitizePayload({ ...item, userId });
          batch.set(docRef, sanitized);
        });
        await batch.commit();
      }
    } catch (err) {
      throw handleFirestoreError(err, OperationType.WRITE, collectionName);
    }
  };

  return { data, loading, error, addOrUpdateItem, removeItem, batchReplaceAll };
}
