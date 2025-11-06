export default {
  state: {
    name: 'codexu'
  },
  mutations: {
    setName(state, payload) {
      state.name = payload;
    }
  },
  actions: {
    getName(store) {
      setTimeout(() => {
        store.commit('setName', 'dispatch name');
      }, 1000);
    }
  }
};