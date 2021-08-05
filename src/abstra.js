/**
 * @name Abstra
 * @constructor
 * @param selection 选择器字符串
 * @param options 参数
 *
 */
class Abstra {
  ref;
  classSelection;
  container;
  constructor(options, selection) {
    // TODO: options
    selection && this.mount(selection);
    const that = new Proxy(this, {
      get(target, key) {
        const result = target[key];
        return result;
      },
      set(target, key, value) {
        const fn = target[`_${key}ProxySetter`];
        let newValue = value;
        if (fn) newValue = fn(value, key, target);
        return Reflect.set(target, key, newValue);
      },
    });
    this.container = this._getNewProxy();
    return that;
  }
  mount(selection = "#app") {
    this._getEl(selection);
    this.renderContent();
  }
  renderContent() {
    console.log(this.container);
  }
  _getEl(selection) {
    this.classSelection = selection;
    const target = document.querySelectorAll(selection);
    if (target.length !== 1) throw Error("绑定元素必须有且仅有一个");
    const el = target[0];
    this.ref = {
      el,
    };
  }
  _getNewProxy(obj = {}) {
    return new Proxy(obj, {
      get(target, key) {
        console.log("新Proxy");
        const result = target[key];
        return result;
      },
      set(target, key, value) {
        return Reflect.set(target, key, value);
      },
    });
  }
  _containerProxySetter(value, key, target) {
    return target._getNewProxy(value);
  }
}
const createApp = (options) => {
  return new Abstra(options);
};
const registerObj = {
  createApp,
  Abstra,
};
Object.keys(registerObj).forEach((name) => {
  this[name] = registerObj[name];
});
