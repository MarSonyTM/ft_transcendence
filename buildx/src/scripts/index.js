import PubSub from './pubSub';

export default class {
  constructor(params) {
    this.status = 'resting';
    this.state = params.state || {};
    this.mutations = params.mutations || {};
    this.actions = params.actions || {};
    this.events = new PubSub();
    this.state = new Proxy((params.state || {}), {
      set: (state, key, value) => {
        state[key] = value;
        this.events.publish(key, state[key]);
        if (this.status !== 'mutation') {
          console.warn(`warn: You should use a mutation to set ${key}`);
        }
        this.status = 'resting';
        return true;
      }
    });
  }
  commit(mutationKey, payload) {
    if (typeof this.mutations[mutationKey] !== 'function') {
      console.warn(`Mutation "${mutationKey}" doesn't exist`);
      return false;
    }
    this.status = 'mutation';
    let mutationState = this.mutations[mutationKey](this.state, payload);
    this.state = Object.assign(this.state, mutationState);
    return true;
  }
  dispatch (actionKey, payload) {
    if (typeof this.actions[actionKey] !== 'function') {
      console.error(`Action "${actionKey} doesn't exist.`);
      return false;
    }
    this.status = 'action';
    this.actions[actionKey](this, payload);
    return true;
  }
  watch (stateKey, callback) {
    this.events.subscribe(stateKey, callback);
  }
}