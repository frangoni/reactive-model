import { UserStore } from '@beyond-js/reactive-2/tests/backend/database';
import type { Server, Socket } from 'socket.io';

export /*actions*/ /*bundle*/ class UserProvider {
	socket: Server;
	constructor(socket: Server) {
		this.socket = socket;
	}
	async publish(data) {
		try {
			const user = new UserStore();
			const response = await user.storeUser(data);
			return { status: true, data: response };
		} catch (e) {
			console.error(e);
			return { error: true, message: e.message };
		}
	}

	async load(id) {
		try {
			if (!id) {
				return { status: false, error: true, message: 'id is required' };
			}
			const user = new UserStore();
			const data = await user.loadUser(id);

			return { status: true, data };
		} catch (e) {
			return { error: true, message: e.message };
		}
	}

	async list() {
		try {
			const user = new UserStore();
			const entries = await user.loadAll();
			return { status: true, data: { entries } };
		} catch (e) {
			return { error: true, message: e.message };
		}
	}

	async bulkSave(data) {
		try {
			const user = new UserStore();

			const entries = await user.bulkSave(data);

			return { status: true, data: { entries } };
		} catch (e) {
			return { error: true, message: e.message };
		}
	}
}
