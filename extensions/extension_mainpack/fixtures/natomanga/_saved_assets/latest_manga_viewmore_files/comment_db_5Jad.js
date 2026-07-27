
const CommentDB = {
    dbName: 'CommentDB',
    dbVersion: 1,
    storeNames: {
        reactions: 'reactions',
        timestamps: 'timestamps',
    },
    db: null,

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeNames.reactions)) {
                    const reactionsStore = db.createObjectStore(this.storeNames.reactions, { keyPath: 'comment_id' });
                    // Create index on user_id for faster queries
                    reactionsStore.createIndex('reactor_id', 'reactor_id', { unique: false });
                }

                if (!db.objectStoreNames.contains('timestamps')) {
                    db.createObjectStore('timestamps');
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    },

    async setTimestamp(key) {
        await this.open();
        const tx = this.db.transaction(this.storeNames.timestamps, 'readwrite');
        const store = tx.objectStore(this.storeNames.timestamps);
        store.put(Date.now(), key);
    },

    async getTimestamp(key) {
        await this.open();
        const tx = this.db.transaction(this.storeNames.timestamps, 'readonly');
        const store = tx.objectStore(this.storeNames.timestamps);
        return new Promise((resolve) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
    },

    async saveToStore(storeName, items) {
        await this.open();
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
    },

    async getFromStore(storeName) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();

            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async getReactionsByUserId(userId) {
        await this.open();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeNames.reactions, 'readonly');
            const store = tx.objectStore(this.storeNames.reactions);
            const index = store.index('reactor_id');
            const req = index.getAll(userId.toString());

            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async getReactionByCommentAndUser(commentId, userId) {
        await this.open();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeNames.reactions, 'readonly');
            const store = tx.objectStore(this.storeNames.reactions);
            const req = store.get(commentId);

            req.onsuccess = () => {
                const reaction = req.result;
                if (reaction && reaction.reactor_id === userId) {
                    resolve(reaction);
                } else {
                    resolve(null);
                }
            };

            req.onerror = (e) => reject(e.target.error);
        });
    },

    async fetchAndCacheMyReactions(userId, apiUrl = '/api/comments/my-reactions') {
        try {
            const timeoutMs = 1000 * 60 * 60;
            const lastFetched = await this.getTimestamp('lastFetchReactions');
            const now = Date.now();

            if (now - lastFetched < timeoutMs) {
                return await this.getFromStore(this.storeNames.reactions);
            }

            const response = await fetch(apiUrl);
            const { data } = await response.json();

            const reactions = data.reactions || [];

            await this.clearUserReactions(userId);

            await this.saveToStore(this.storeNames.reactions, reactions);

            await this.setTimestamp('lastFetchReactions');

            return reactions;
        } catch (err) {
            console.error('Error fetching lastFetchReactions:', err);
            return [];
        }
    },

    async clearUserReactions(userId) {
        await this.open();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeNames.reactions, 'readwrite');
            const store = tx.objectStore(this.storeNames.reactions);
            const index = store.index('reactor_id');
            const req = index.getAllKeys(userId);

            req.onsuccess = () => {
                const commentIds = req.result;

                // Delete all reactions for this user
                commentIds.forEach(commentId => {
                    store.delete(commentId);
                });

                resolve();
            };

            req.onerror = (e) => reject(e.target.error);
        });
    },

    async getReactions(timeoutMs = 1000 * 60 * 60) {
        const lastFetched = await this.getTimestamp('lastFetchReactions');
        const now = Date.now();

        if (now - lastFetched < timeoutMs) {
            return await this.getFromStore(this.storeNames.reactions);
        }

        return await this.fetchAndCacheMyReactions();
    },

    async saveReaction(reactionData) {
        await this.open();
        const tx = this.db.transaction(this.storeNames.reactions, 'readwrite');
        const store = tx.objectStore(this.storeNames.reactions);
        store.put(reactionData); // This handles both create and update
    },

    async deleteReaction(commentId) {
        await this.open();
        const tx = this.db.transaction(this.storeNames.reactions, 'readwrite');
        const store = tx.objectStore(this.storeNames.reactions);
        store.delete(commentId);
    },
};

window.CommentDB = CommentDB;
