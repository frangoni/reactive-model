import { ReactiveModel } from '@beyond-js/reactive/model';

import { IProvider } from '../interfaces/provider';
import { liveQuery } from 'dexie';
import { PendingPromise } from '@beyond-js/kernel/core';
import { DBManager, DatabaseManager } from '@beyond-js/reactive/database';
import Dexie from 'dexie';
import { FactoryRecords } from '../registry/factory';

interface IItemValues {
    [key: string]: any;
    offline: number;
    instanceId: string;
}
export /*bundle*/ class CollectionLocalProvider extends ReactiveModel<any> {
    #isOnline = globalThis.navigator.onLine;
    #store!: Dexie.Table<any, any>;
    get store() {
        return this.#store;
    }
    #offline: boolean;
    #database!: DatabaseManager;
    #storeName!: string;
    #databaseName!: string;
    #items = [];
    #records: FactoryRecords;
    get items() {
        return this.#items;
    }
    #exists = false;
    #found = false;
    #ids = new Set();
    #db: Dexie;
    get isOnline() {
        return this.#isOnline && !this.#offline && !localStorage.getItem('reactive.offline');
    }
    #parent;
    #bridge;
    constructor(parent, bridge: any) {
        super();
        const { db, storeName } = parent;
        this.#parent = parent;
        this.#bridge = bridge;
        this.#records = FactoryRecords.get(db);

        if (!db || !storeName) throw new Error('database and store are required');
        this.#databaseName = db;
        this.#storeName = storeName;

        globalThis.addEventListener('online', this.handleConnection);
        globalThis.addEventListener('offline', this.handleConnection);
    }

    setOffline(value) {
        this.#offline = value;
        this.triggerEvent();
    }
    #promiseInit: PendingPromise<void>;
    init = async () => {
        try {
            if (this.#promiseInit) return this.#promiseInit;
            this.#promiseInit = new PendingPromise();

            const database: DatabaseManager = await DBManager.get(this.#databaseName);
            this.#database = database;
            this.#store = database.db[this.#storeName];
            this.ready = true;
            this.#promiseInit.resolve();
        } catch (e) {
            console.error(e);
        }
    };

    private handleConnection = () => {
        this.triggerEvent();
    };

    /**
     * @todo: Must validated if some item in the collection is not sync.
     * @param data
     * @returns
     */
    #isUnpublished(data) {}
    #promiseLoad: PendingPromise<any>;
    #params;

    #total;
    #page = 0;

    #customWhere;
    #defaultWhere = (store, offset, limit) => store.orderBy('id');

    where = limit => {
        return () => {
            let store = this.#store;
            const offset = (this.#page - 1) * limit;
            const filter = this.#customWhere ?? this.#defaultWhere;

            return filter(store, offset, limit).offset(offset).limit(limit).toArray();
        };
    };

    customFilter = callback => {
        this.#customWhere = callback;
        return this.#parent;
    };
    async load(params) {
        if (this.#promiseLoad) return this.#promiseLoad;
        if (JSON.stringify(this.#params) === JSON.stringify(params)) {
            return this.#promiseLoad;
        }
        this.#promiseLoad = new PendingPromise();
        await this.init();
        const conditions = Object.keys(params);
        const controls = ['and', 'or'];
        conditions.forEach(condition => {
            if (controls.includes(condition)) {
                this.#processControl(condition, params[condition]);
            }
        });

        try {
            if (!this.#total) this.#total = await this.#store.count();
            let limit = params.limit ?? 30;
            const totalPages = Math.ceil(this.#total / limit);
            if (totalPages <= this.#page) return;
            let first = true;
            const live = liveQuery(this.where(limit));
            this.#page++;
            live.subscribe({
                next: async items => {
                    if (this.#promiseLoad) {
                        first = false;
                        const response = { status: true, data: items, total: this.#total, next: true };
                        if (this.#page + 1 >= totalPages) delete response.next;

                        this.#promiseLoad.resolve(response);
                        this.#promiseLoad = null;
                    }

                    this.#items = this.#items.concat(items.filter(item => !this.#ids.has(item.id)));
                    items.forEach(item => this.#ids.add(item.id));
                    this.trigger('items.changed');
                },
                error: err => {
                    console.error(err);
                },
            });
            return this.#promiseLoad;
            //return await this.live.toArray();
        } catch (error) {
            console.error('Error al cargar los elementos del store:', error);
            return { status: false, data: [] };
        }
    }

    async save(data): Promise<any> {
        const process = (entries, offline = 0) => {
            return entries.map(item => {
                const record =
                    item.getProperties && typeof item.getProperties === 'function' ? item.getProperties() : item;
                const toSave = { ...record, offline, instanceId: item.instanceId };
                return toSave;
            });
        };

        data = process(data, this.isOnline ? 0 : 1);

        await this.#records.init();
        await this.#records.saveAll(data, this.#storeName);
    }
    #processControl(control, conditions) {
        this.#store[control];
    }

    async upsert(data: IItemValues[], originalData: any[]): Promise<void> {
        return this.#database.db.transaction('rw', this.store, async () => {
            const instanceIdToIdMap = new Map<string, number>();
            data.forEach(item => {
                instanceIdToIdMap.set(item.instanceId, item.id);
            });
            await this.store.bulkPut(data);
        });
    }
}
