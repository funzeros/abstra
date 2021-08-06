function isObject(obj) {
  return typeof obj === "object";
}
function isArray(obj) {
  return obj instanceof Array;
}
function isRef(raw) {
  return raw ? !!raw._isRef : false;
}
/** 监听原始值 */
function ref(primitive) {
  // 是否已经包装过
  if (isRef(primitive)) return primitive;
  // object 类型使用 reactive 包装，其他不用变
  const convertObj = (raw) => (isObject(raw) ? reactive(raw) : raw);
  primitive = convertObj(primitive);
  // 将原始值包装起来
  const wrapper = {
    _isRef: true,
    get value() {
      // 收集依赖
      track(wrapper, "get", "value");
      return primitive;
    },
    set value(v) {
      primitive = convertObj(v);
      trigger(wrapper, "set", "value");
    },
  };
  return wrapper;
}

// 原始对象 与 代理对象 互相映射，缓存
const rawToReactive = new WeakMap();
const reactiveToRaw = new WeakMap();
const isReative = (obj) => reactiveToRaw.has(obj);

/** 对象类型 响应式包装 */
function reactive(obj) {
  if (!isObject(obj)) return obj;
  const cache = rawToReactive.get(obj);
  // 原始对象已经包装过
  if (cache) return cache;
  // 已经是代理对象
  if (isReative(obj)) return obj;
  const proxy = new Proxy(obj, {
    get(obj, key, receiver) {
      const res = Reflect.get(obj, key, receiver);
      // 收集依赖
      track(obj, "get", key);
      // 递归包装子对象
      return isObject(res) ? reactive(res) : res;
    },
    set(obj, key, newVal, receiver) {
      const hasKey = Reflect.has(obj, key);
      const oldVal = obj[key];
      const isChanged = oldVal !== newVal;

      const res = Reflect.set(obj, key, newVal, receiver);
      // 如果当前对象其实在原型链上被设值，就不通知订阅
      if (obj === rawToReactive.get(receiver)) return res;

      if (!hasKey) {
        // add
        trigger(obj, "add", key, newVal);
      } else if (isChanged) {
        // set
        trigger(obj, "set", key, newVal);
      }

      return res;
    },
    has(obj, key) {
      track(obj, "has", key);
      return Reflect.has(obj, key);
    },
    ownKeys(obj) {
      track(obj, "iterate");
      return Reflect.ownKeys(obj);
    },
  });

  rawToReactive.set(obj, proxy);
  reactiveToRaw.set(proxy, obj);
  // 这里其实不是必须，track 的时候会新建
  // if (!targetMap.get(obj)) { targetMap.set(obj, new Map())}
  return proxy;
}

/** 储存订阅 WeakMap<object, Map<key, Set<Function>>> */
const targetMap = new WeakMap();

/** 数组各 index(012345...) 的订阅统一到该键上 */
const ITERATE_KEY = Symbol("iterate");

/** 收集依赖 */
function track(obj, type, key = "") {
  // 没有当前需要收集的订阅事件，就不需要收集
  if (effectStack.length === 0) return;
  // ownKeys 时收集
  if (type === "iterate") key = ITERATE_KEY;
  // 存取订阅到对应位置
  let target = targetMap.get(obj);
  if (!target) targetMap.set(obj, (target = new Map()));
  let deps = target.get(key);
  if (!deps) target.set(key, (deps = new Set()));
  const currentEffect = effectStack[effectStack.length - 1];
  // 如果已经订阅，就不收集
  if (deps.has(currentEffect)) return;
  deps.add(currentEffect);
  currentEffect.deps.push(deps);
}

// setter 时通知订阅
function trigger(obj, type, key, newValue) {
  const target = targetMap.get(obj);
  if (!target) return;
  // 区分两种订阅，先通知 computed
  const computedRunners = new Set();
  const effects = new Set();
  const addRunners = (key) => {
    const depList = target.get(key);
    if (!depList) return;
    depList.forEach((effect) => {
      if (effect.options.computed) computedRunners.add(effect);
      else effects.add(effect);
    });
  };
  // 普通修改先加 key
  if (key != void 0) addRunners(key);
  // 属性添加 删除 操作还有通知对应的 key
  // 数组属性 0 1 2 3统一为一个 IterateKey
  if (type === "add" || type === "delete") {
    const iterationKey = isArray(obj) ? "length" : ITERATE_KEY;
    addRunners(iterationKey);
  }

  const run = (effect) => {
    // 自定义执行方式，主要是 computed 需要自定义
    if (effect.options.scheduler !== void 0) effect.options.scheduler(effect);
    else effect();
  };
  // 先执行 computed
  computedRunners.forEach(run);
  effects.forEach(run);
}

/** 存储当前需要收集依赖的订阅，暂时性 */
const effectStack = [];
const isEffect = (e) => !!e._isEffect;

function effect(fn, opt = {}) {
  if (isEffect(fn)) fn = fn.raw;

  // 包装 订阅函数
  // 这样每次执行回调函数都会收集依赖
  const effectWrapper = function reactiveEffect(...args) {
    if (effectStack.includes(effectWrapper)) return;
    // 去掉所有订阅列表中当前 effect
    effectWrapper.deps.forEach((dep) => {
      dep.delete(effectWrapper);
    });
    effectWrapper.deps.length = 0;
    try {
      // 当前要订阅的 effect, 重新收集
      effectStack.push(effectWrapper);
      // 开始收集
      return fn(...args);
    } finally {
      // 收集完清理
      effectStack.pop();
    }
  };
  effectWrapper._isEffect = true;
  effectWrapper.raw = fn;
  effectWrapper.deps = [];
  effectWrapper.options = opt;
  if (!opt.lazy) effectWrapper();
  return effectWrapper;
}

// computed 是一个有 effect 的 ref
function computed(fnOrObj) {
  let getter, setter;
  if (typeof fnOrObj === "object") {
    getter = fnOrObj.gettter;
    setter = fnOrObj.setter;
  } else {
    getter = fnOrObj;
  }
  let value;
  // 脏值检查，第一次要设为true，
  // 这样第一次get的时候 才会跑一下 runner 收集到订阅的事件
  let dirty = true;
  const runner = effect(getter, {
    computed: true,
    lazy: true,
    // 自定义订阅的执行方式，这里意思是依赖发送通知时，不执行，但标记为脏值。
    // 延迟到 getter 时才执行
    scheduler: () => {
      dirty = true;
    },
  });
  return {
    _isRef: true,
    // 暴露 effect 用于停止监听
    effect: runner,
    get value() {
      if (dirty) {
        dirty = false;
        value = runner();
      }
      // 将依赖 computed 的订阅函数 记录到对应列表
      if (effectStack.length !== 0) {
        const currentEffect = effectStack[effectStack.length - 1];
        runner.deps.forEach((dep) => {
          if (!dep.has(currentEffect)) {
            dep.add(currentEffect);
            currentEffect.deps.push(dep);
          }
        });
      }
      return value;
    },
    set value(newVal) {
      if (setter) setter(newVal);
    },
  };
}
function randomStr() {
  return Math.floor(Math.random() * Math.pow(10, 10)).toString("16");
}

function HTML2DOM(html) {
  const parser = new DOMParser();
  const documentDom = parser.parseFromString(html, "text/html");
  return documentDom.body.children;
}
/**
 * @name Abstra
 * @constructor
 * @param components 组件
 * @param selection 选择器字符串
 *
 */
class Abstra {
  ref;
  classSelection;
  components;
  tempMap = new Map();
  constructor(components, selection) {
    components && (this.components = components);
    selection && this.mount(selection);
  }
  mount(selection = "#app") {
    this._getEl(selection);
    this._getTemplate();
    this.renderContent();
  }
  renderContent() {
    this.components.forEach((component) => {
      const { name, setup } = component;
      if (!this.tempMap.has(name))
        return console.error(new Error(`${name}组件未找到模板`));
      const template = this.tempMap.get(name);
      const templateDom = HTML2DOM(template.innerHTML);
      const tags = Array.from(document.body.getElementsByTagName(name));
      tags.forEach((element) => {
        this._compiler(templateDom, setup(), true).forEach((dom) => {
          element.appendChild(dom);
        });
      });
    });
  }
  /**
   * @name _compiler
   * @description  解析dom
   * @param {*} domList
   */
  _compiler(domList, ctx, isNew = false) {
    return Array.from(domList, (m) => {
      const newNode = isNew ? m.cloneNode(true) : m;
      if (newNode.children) this._compiler(newNode.children, ctx);
      Array.from(newNode.attributes, (o) => {
        const { name, value } = o;
        if (name.startsWith("@")) {
          newNode.addEventListener(
            name.substring(1),
            new Function(value).bind(ctx)
          );
        }
      });
      return newNode;
    });
  }
  _getTemplate() {
    this.ref.el.querySelectorAll("template").forEach((m) => {
      const name = m.dataset.name;
      if (!name) throw Error("");
      this.tempMap.set(name, m);
    });
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
}
const createApp = (components) => {
  return new Abstra(components);
};
const registerObj = {
  createApp,
  Abstra,
};
Object.keys(registerObj).forEach((name) => {
  this[name] = registerObj[name];
});
