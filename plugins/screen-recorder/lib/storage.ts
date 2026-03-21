/**
 * Screen Recorder IndexedDB Storage
 *
 * Stores recordings in IndexedDB for persistence.
 * Uses two object stores:
 * - recordings: Metadata only (for quick listing)
 * - recordingEvents: Full events data (large, loaded on demand)
 */

import type { Recording, RecordingData, RecordingStorage } from "../types";

const DB_NAME = "daax-screen-recorder";
const DB_VERSION = 1;
const METADATA_STORE = "recordings";
const EVENTS_STORE = "recording-events";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create metadata store
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metaStore = db.createObjectStore(METADATA_STORE, {
          keyPath: "id",
        });
        metaStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Create events store (separate to keep metadata queries fast)
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        db.createObjectStore(EVENTS_STORE, { keyPath: "id" });
      }
    };
  });

  return dbPromise;
}

/**
 * Save a recording (metadata + events)
 */
async function saveRecording(recording: RecordingData): Promise<void> {
  const db = await openDB();

  // Extract metadata (without events)
  const metadata: Recording = {
    id: recording.id,
    name: recording.name,
    startTime: recording.startTime,
    endTime: recording.endTime,
    duration: recording.duration,
    eventCount: recording.eventCount,
    createdAt: recording.createdAt,
    url: recording.url,
  };

  // Store metadata
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([METADATA_STORE], "readwrite");
    const store = tx.objectStore(METADATA_STORE);
    const request = store.put(metadata);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to save metadata"));
  });

  // Store events separately
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([EVENTS_STORE], "readwrite");
    const store = tx.objectStore(EVENTS_STORE);
    const request = store.put({ id: recording.id, events: recording.events });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to save events"));
  });
}

/**
 * Get a full recording with events
 */
async function getRecording(id: string): Promise<RecordingData | null> {
  const db = await openDB();

  // Get metadata
  const metadata = await new Promise<Recording | null>((resolve, reject) => {
    const tx = db.transaction([METADATA_STORE], "readonly");
    const store = tx.objectStore(METADATA_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error("Failed to get metadata"));
  });

  if (!metadata) return null;

  // Get events
  const eventsData = await new Promise<{
    id: string;
    events: RecordingData["events"];
  } | null>((resolve, reject) => {
    const tx = db.transaction([EVENTS_STORE], "readonly");
    const store = tx.objectStore(EVENTS_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error("Failed to get events"));
  });

  if (!eventsData) return null;

  return {
    ...metadata,
    events: eventsData.events,
  };
}

/**
 * Get all recordings (metadata only)
 */
async function getAllRecordings(): Promise<Recording[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([METADATA_STORE], "readonly");
    const store = tx.objectStore(METADATA_STORE);
    const index = store.index("createdAt");
    const request = index.openCursor(null, "prev"); // Newest first

    const recordings: Recording[] = [];
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        recordings.push(cursor.value);
        cursor.continue();
      } else {
        resolve(recordings);
      }
    };
    request.onerror = () => reject(new Error("Failed to list recordings"));
  });
}

/**
 * Delete a recording
 */
async function deleteRecording(id: string): Promise<void> {
  const db = await openDB();

  // Delete metadata
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([METADATA_STORE], "readwrite");
    const store = tx.objectStore(METADATA_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to delete metadata"));
  });

  // Delete events
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([EVENTS_STORE], "readwrite");
    const store = tx.objectStore(EVENTS_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to delete events"));
  });
}

/**
 * Clear all recordings
 */
async function clearAllRecordings(): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([METADATA_STORE, EVENTS_STORE], "readwrite");
    tx.objectStore(METADATA_STORE).clear();
    tx.objectStore(EVENTS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Failed to clear recordings"));
  });
}

/**
 * Storage implementation
 */
export const recordingStorage: RecordingStorage = {
  saveRecording,
  getRecording,
  getAllRecordings,
  deleteRecording,
  clearAllRecordings,
};
