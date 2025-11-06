export default class PubSub {
  constructor() {
    this.events = {};
  }
  subscribe(event, callback) {
    if (!this.events.hasOwnProperty(event)) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  async publish(event, data = {}) {
    if (!this.events.hasOwnProperty(event)) {
      return [];
    }
    for (let i = 0; i < this.events[event].length; i++) {
      await this.events[event][i](data); // eslint-disable-line
    }
  }
}