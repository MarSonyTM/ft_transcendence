import Store from './index';
import states from './states';

const store = new Store(states);

store.watch('name', value => console.log(value));

store.commit('setName', 'commit name');
store.dispatch('getName');