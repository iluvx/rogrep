// ==UserScript==
// @name        rogrep
// @namespace   Violentmonkey Scripts
// @description Find roblox users in public servers
// @match       *://*.roblox.com/games/*
// @match       *://roblox.com/games/*
// @version     0.0.0
// @author      iluvx
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/ui@0.7
// @grant       GM_addStyle
// ==/UserScript==

(function (ui) {
'use strict';

const IS_DEV = false;
const equalFn = (a, b) => a === b;
const signalOptions = {
  equals: equalFn
};
let runEffects = runQueue;
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
var Owner = null;
let Transition = null;
let ExternalSourceConfig = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
function createRoot(fn, detachedOwner) {
  const listener = Listener,
    owner = Owner,
    unowned = fn.length === 0,
    current = detachedOwner === undefined ? owner : detachedOwner,
    root = unowned ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: current ? current.context : null,
      owner: current
    },
    updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
  Owner = root;
  Listener = null;
  try {
    return runUpdates(updateFn, true);
  } finally {
    Listener = listener;
    Owner = owner;
  }
}
function createSignal(value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const s = {
    value,
    observers: null,
    observerSlots: null,
    comparator: options.equals || undefined
  };
  const setter = value => {
    if (typeof value === "function") {
      value = value(s.value);
    }
    return writeSignal(s, value);
  };
  return [readSignal.bind(s), setter];
}
function createRenderEffect(fn, value, options) {
  const c = createComputation(fn, value, false, STALE);
  updateComputation(c);
}
function createMemo(fn, value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const c = createComputation(fn, value, true, 0);
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || undefined;
  updateComputation(c);
  return readSignal.bind(c);
}
function untrack(fn) {
  if (Listener === null) return fn();
  const listener = Listener;
  Listener = null;
  try {
    if (ExternalSourceConfig) ;
    return fn();
  } finally {
    Listener = listener;
  }
}
function readSignal() {
  if (this.sources && (this.state)) {
    if ((this.state) === STALE) updateComputation(this);else {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(this), false);
      Updates = updates;
    }
  }
  if (Listener) {
    const observers = this.observers;
    if (!observers || observers[observers.length - 1] !== Listener) {
      const sSlot = observers ? observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
  }
  return this.value;
}
function writeSignal(node, value, isComp) {
  let current = node.value;
  if (!node.comparator || !node.comparator(current, value)) {
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          const TransitionRunning = Transition && Transition.running;
          if (TransitionRunning && Transition.disposed.has(o)) ;
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure) Updates.push(o);else Effects.push(o);
            if (o.observers) markDownstream(o);
          }
          if (!TransitionRunning) o.state = STALE;
        }
        if (Updates.length > 10e5) {
          Updates = [];
          if (IS_DEV) ;
          throw new Error();
        }
      }, false);
    }
  }
  return value;
}
function updateComputation(node) {
  if (!node.fn) return;
  cleanNode(node);
  const time = ExecCount;
  runComputation(node, node.value, time);
}
function runComputation(node, value, time) {
  let nextValue;
  const owner = Owner,
    listener = Listener;
  Listener = Owner = node;
  try {
    nextValue = node.fn(value);
  } catch (err) {
    if (node.pure) {
      {
        node.state = STALE;
        node.owned && node.owned.forEach(cleanNode);
        node.owned = null;
      }
    }
    node.updatedAt = time + 1;
    return handleError(err);
  } finally {
    Listener = listener;
    Owner = owner;
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node, nextValue);
    } else node.value = nextValue;
    node.updatedAt = time;
  }
}
function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state: state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure
  };
  if (Owner === null) ;else if (Owner !== UNOWNED) {
    {
      if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
    }
  }
  return c;
}
function runTop(node) {
  if ((node.state) === 0) return;
  if ((node.state) === PENDING) return lookUpstream(node);
  if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if ((node.state) === STALE) {
      updateComputation(node);
    } else if ((node.state) === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }
}
function runUpdates(fn, init) {
  if (Updates) return fn();
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true;else Effects = [];
  ExecCount++;
  try {
    const res = fn();
    completeUpdates(wait);
    return res;
  } catch (err) {
    if (!wait) Effects = null;
    Updates = null;
    handleError(err);
  }
}
function completeUpdates(wait) {
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  if (wait) return;
  const e = Effects;
  Effects = null;
  if (e.length) runUpdates(() => runEffects(e), false);
}
function runQueue(queue) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}
function lookUpstream(node, ignore) {
  node.state = 0;
  for (let i = 0; i < node.sources.length; i += 1) {
    const source = node.sources[i];
    if (source.sources) {
      const state = source.state;
      if (state === STALE) {
        if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
      } else if (state === PENDING) lookUpstream(source, ignore);
    }
  }
}
function markDownstream(node) {
  for (let i = 0; i < node.observers.length; i += 1) {
    const o = node.observers[i];
    if (!o.state) {
      o.state = PENDING;
      if (o.pure) Updates.push(o);else Effects.push(o);
      o.observers && markDownstream(o);
    }
  }
}
function cleanNode(node) {
  let i;
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(),
        index = node.sourceSlots.pop(),
        obs = source.observers;
      if (obs && obs.length) {
        const n = obs.pop(),
          s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
  if (node.tOwned) {
    for (i = node.tOwned.length - 1; i >= 0; i--) cleanNode(node.tOwned[i]);
    delete node.tOwned;
  }
  if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
    node.cleanups = null;
  }
  node.state = 0;
}
function castError(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const error = castError(err);
  throw error;
}
function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}

const narrowedError = name => `Stale read from <${name}>.`;
function Show(props) {
  const keyed = props.keyed;
  const conditionValue = createMemo(() => props.when, undefined, undefined);
  const condition = keyed ? conditionValue : createMemo(conditionValue, undefined, {
    equals: (a, b) => !a === !b
  });
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      const fn = typeof child === "function" && child.length > 0;
      return fn ? untrack(() => child(keyed ? c : () => {
        if (!untrack(condition)) throw narrowedError("Show");
        return conditionValue();
      })) : child;
    }
    return props.fallback;
  }, undefined, undefined);
}

function reconcileArrays(parentNode, a, b) {
  let bLength = b.length,
    aEnd = a.length,
    bEnd = bLength,
    aStart = 0,
    bStart = 0,
    after = a[aEnd - 1].nextSibling,
    map = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove();
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      if (!map) {
        map = new Map();
        let i = bStart;
        while (i < bEnd) map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart,
            sequence = 1,
            t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) parentNode.insertBefore(b[bStart++], node);
          } else parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else aStart++;
      } else a[aStart++].remove();
    }
  }
}

const $$EVENTS = "_$DX_DELEGATE";
function render(code, element, init, options = {}) {
  let disposer;
  createRoot(dispose => {
    disposer = dispose;
    element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
  }, options.owner);
  return () => {
    disposer();
    element.textContent = "";
  };
}
function template(html, isImportNode, isSVG, isMathML) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstChild;
  };
  const fn = () => (node || (node = create())).cloneNode(true);
  fn.cloneNode = fn;
  return fn;
}
function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}
function setAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
}
function className(node, value) {
  if (value == null) node.removeAttribute("class");else node.className = value;
}
function use(fn, element, arg) {
  return untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker, initial) {
  if (marker !== undefined && !initial) initial = [];
  if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
  createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
}
function eventHandler(e) {
  let node = e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;
  const retarget = value => Object.defineProperty(e, "target", {
    configurable: true,
    value
  });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode() && (node = node._$host || node.parentNode || node.host));
  };
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  if (e.composedPath) {
    const path = e.composedPath();
    retarget(path[0]);
    for (let i = 0; i < path.length - 2; i++) {
      node = path[i];
      if (!handleNode()) break;
      if (node._$host) {
        node = node._$host;
        walkUpTree();
        break;
      }
      if (node.parentNode === oriCurrentTarget) {
        break;
      }
    }
  }
  else walkUpTree();
  retarget(oriTarget);
}
function insertExpression(parent, value, current, marker, unwrapArray) {
  while (typeof current === "function") current = current();
  if (value === current) return current;
  const t = typeof value,
    multi = marker !== undefined;
  parent = multi && current[0] && current[0].parentNode || parent;
  if (t === "string" || t === "number") {
    if (t === "number") {
      value = value.toString();
      if (value === current) return current;
    }
    if (multi) {
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data !== value && (node.data = value);
      } else node = document.createTextNode(value);
      current = cleanChildren(parent, current, marker, node);
    } else {
      if (current !== "" && typeof current === "string") {
        current = parent.firstChild.data = value;
      } else current = parent.textContent = value;
    }
  } else if (value == null || t === "boolean") {
    current = cleanChildren(parent, current, marker);
  } else if (t === "function") {
    createRenderEffect(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  } else if (Array.isArray(value)) {
    const array = [];
    const currentArray = current && Array.isArray(current);
    if (normalizeIncomingArray(array, value, current, unwrapArray)) {
      createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
      return () => current;
    }
    if (array.length === 0) {
      current = cleanChildren(parent, current, marker);
      if (multi) return current;
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, array, marker);
      } else reconcileArrays(parent, current, array);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, array);
    }
    current = array;
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      if (multi) return current = cleanChildren(parent, current, marker, value);
      cleanChildren(parent, current, null, value);
    } else if (current == null || current === "" || !parent.firstChild) {
      parent.appendChild(value);
    } else parent.replaceChild(value, parent.firstChild);
    current = value;
  } else ;
  return current;
}
function normalizeIncomingArray(normalized, array, current, unwrap) {
  let dynamic = false;
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i],
      prev = current && current[normalized.length],
      t;
    if (item == null || item === true || item === false) ; else if ((t = typeof item) === "object" && item.nodeType) {
      normalized.push(item);
    } else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
    } else if (t === "function") {
      if (unwrap) {
        while (typeof item === "function") item = item();
        dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
      } else {
        normalized.push(item);
        dynamic = true;
      }
    } else {
      const value = String(item);
      if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);else normalized.push(document.createTextNode(value));
    }
  }
  return dynamic;
}
function appendNodes(parent, array, marker = null) {
  for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === undefined) return parent.textContent = "";
  const node = replacement || document.createTextNode("");
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (node !== el) {
        const isParent = el.parentNode === parent;
        if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
      } else inserted = true;
    }
  } else parent.insertBefore(node, marker);
  return [node];
}

var css_248z = "";

var styles = {"root":"style-module_root__d9Kr2","header":"style-module_header__TLWM-","form":"style-module_form__n4UNZ","input":"style-module_input__rPbzC","button":"style-module_button__EkTwi","result":"style-module_result__1O8zN","loading":"style-module_loading__o2iw7","error":"style-module_error__6a308","card":"style-module_card__G0TgL","avatar":"style-module_avatar__VTE1k","info":"style-module_info__pWvNx","name":"style-module_name__SL3bM","found":"style-module_found__3KKGq","notFound":"style-module_notFound__FIGwt","meta":"style-module_meta__E9-B9","serverId":"style-module_serverId__GUEj6","join":"style-module_join__vAPfA"};
var stylesheet="*,:after,:before{--un-rotate:0;--un-rotate-x:0;--un-rotate-y:0;--un-rotate-z:0;--un-scale-x:1;--un-scale-y:1;--un-scale-z:1;--un-skew-x:0;--un-skew-y:0;--un-translate-x:0;--un-translate-y:0;--un-translate-z:0;--un-pan-x: ;--un-pan-y: ;--un-pinch-zoom: ;--un-scroll-snap-strictness:proximity;--un-ordinal: ;--un-slashed-zero: ;--un-numeric-figure: ;--un-numeric-spacing: ;--un-numeric-fraction: ;--un-border-spacing-x:0;--un-border-spacing-y:0;--un-ring-offset-shadow:0 0 transparent;--un-ring-shadow:0 0 transparent;--un-shadow-inset: ;--un-shadow:0 0 transparent;--un-ring-inset: ;--un-ring-offset-width:0px;--un-ring-offset-color:#fff;--un-ring-width:0px;--un-ring-color:rgba(147,197,253,.5);--un-blur: ;--un-brightness: ;--un-contrast: ;--un-drop-shadow: ;--un-grayscale: ;--un-hue-rotate: ;--un-invert: ;--un-saturate: ;--un-sepia: ;--un-backdrop-blur: ;--un-backdrop-brightness: ;--un-backdrop-contrast: ;--un-backdrop-grayscale: ;--un-backdrop-hue-rotate: ;--un-backdrop-invert: ;--un-backdrop-opacity: ;--un-backdrop-saturate: ;--un-backdrop-sepia: }::backdrop{--un-rotate:0;--un-rotate-x:0;--un-rotate-y:0;--un-rotate-z:0;--un-scale-x:1;--un-scale-y:1;--un-scale-z:1;--un-skew-x:0;--un-skew-y:0;--un-translate-x:0;--un-translate-y:0;--un-translate-z:0;--un-pan-x: ;--un-pan-y: ;--un-pinch-zoom: ;--un-scroll-snap-strictness:proximity;--un-ordinal: ;--un-slashed-zero: ;--un-numeric-figure: ;--un-numeric-spacing: ;--un-numeric-fraction: ;--un-border-spacing-x:0;--un-border-spacing-y:0;--un-ring-offset-shadow:0 0 transparent;--un-ring-shadow:0 0 transparent;--un-shadow-inset: ;--un-shadow:0 0 transparent;--un-ring-inset: ;--un-ring-offset-width:0px;--un-ring-offset-color:#fff;--un-ring-width:0px;--un-ring-color:rgba(147,197,253,.5);--un-blur: ;--un-brightness: ;--un-contrast: ;--un-drop-shadow: ;--un-grayscale: ;--un-hue-rotate: ;--un-invert: ;--un-saturate: ;--un-sepia: ;--un-backdrop-blur: ;--un-backdrop-brightness: ;--un-backdrop-contrast: ;--un-backdrop-grayscale: ;--un-backdrop-hue-rotate: ;--un-backdrop-invert: ;--un-backdrop-opacity: ;--un-backdrop-saturate: ;--un-backdrop-sepia: }.style-module_root__d9Kr2{background:#1f2430;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);color:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;padding:14px;width:320px}.style-module_header__TLWM-{color:#cdd3e0;cursor:move;font-size:13px;font-weight:600;margin-bottom:12px;user-select:none}.style-module_form__n4UNZ{display:flex;gap:8px}.style-module_input__rPbzC{background:#131722;border:1px solid #3a4152;border-radius:8px;color:#f3f4f6;flex:1;font-size:13px;min-width:0;outline:none;padding:8px 10px}.style-module_input__rPbzC:focus{border-color:#335fff}.style-module_button__EkTwi{background:#335fff;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;padding:8px 14px}.style-module_button__EkTwi:disabled{cursor:default;opacity:.6}.style-module_result__1O8zN{margin-top:12px;min-height:8px}.style-module_loading__o2iw7{color:#9aa4bd;font-size:13px}.style-module_error__6a308{color:#ff6b6b;font-size:13px}.style-module_card__G0TgL{align-items:flex-start;display:flex;gap:12px}.style-module_avatar__VTE1k{background:#131722;border-radius:8px;flex-shrink:0;height:56px;width:56px}.style-module_info__pWvNx{display:flex;flex-direction:column;gap:3px;min-width:0}.style-module_found__3KKGq,.style-module_name__SL3bM{font-size:13px;font-weight:600}.style-module_found__3KKGq{color:#4ade80}.style-module_notFound__FIGwt{color:#ff6b6b;font-size:13px}.style-module_meta__E9-B9{color:#9aa4bd;font-size:12px}.style-module_serverId__GUEj6{color:#6b7280;font-size:11px;word-break:break-all}.style-module_join__vAPfA{color:#7aa2ff;font-size:12px;margin-top:4px;text-decoration:none}.style-module_join__vAPfA:hover{text-decoration:underline}";

function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}

// Roblox Web API helpers implementing the flow described in info.txt:
// 1. Resolve a username to a user id.
// 2. Fetch that user's avatar headshot (to compare against server players).
// 3. Page through the game's public servers, collecting player tokens.
// 4. Batch-resolve the player tokens to avatar headshots.
// 5. Match the target user's headshot against the servers' headshots.

//asasas

const COMMON_HEADERS = {
  accept: '*/*',
  'accept-language': 'en-GB,en;q=0.9'
};

/** How long to wait before retrying after a 429 (Too Many Requests). */
const RETRY_DELAY_MS = 10000;
/** Maximum number of retries before giving up on a rate-limited request. */
const MAX_RETRIES = 10;

/** Called when a request is rate limited, so callers can surface a message. */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Like `fetch`, but when the response is a 429 it waits (respecting the
 * `Retry-After` header when present, otherwise 10 seconds) and retries.
 */
async function fetchWithRetry(input, init, onRateLimit) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(input, init);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    attempt += 1;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(retryAfter * 1000, RETRY_DELAY_MS) : RETRY_DELAY_MS;
    onRateLimit == null || onRateLimit({
      attempt,
      waitMs
    });
    await delay(waitMs);
  }
}

/**
 * The headshot cdn url embeds a content hash that is stable for a given
 * rendered avatar. We compare on that hash so the target lookup and the batch
 * lookup only need to agree on the render parameters (size/format/filter).
 */
function headshotHash(imageUrl) {
  const match = imageUrl.match(/AvatarHeadshot-([A-Fa-f0-9]+)/);
  return match ? match[1].toUpperCase() : imageUrl;
}

/** Resolve a username to its Roblox user record. Returns null if not found. */
async function resolveUsername(username, onRateLimit) {
  var _json$data$, _json$data;
  const res = await fetchWithRetry('https://users.roblox.com/v1/usernames/users', {
    headers: _extends({}, COMMON_HEADERS, {
      'content-type': 'application/json'
    }),
    referrer: 'https://www.roblox.com/',
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    }),
    method: 'POST',
    mode: 'cors',
    credentials: 'omit'
  }, onRateLimit);
  if (!res.ok) throw new Error(`Username lookup failed (${res.status})`);
  const json = await res.json();
  return (_json$data$ = (_json$data = json.data) == null ? void 0 : _json$data[0]) != null ? _json$data$ : null;
}

/**
 * Fetch a user's avatar headshot url. `isCircular` is kept false so the render
 * parameters match the batch lookup used for server players.
 */
async function getUserHeadshot(userId, onRateLimit) {
  var _json$data$0$imageUrl, _json$data2;
  const res = await fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, {
    headers: COMMON_HEADERS,
    referrer: 'https://www.roblox.com/',
    method: 'GET',
    mode: 'cors',
    credentials: 'include'
  }, onRateLimit);
  if (!res.ok) throw new Error(`Avatar lookup failed (${res.status})`);
  const json = await res.json();
  return (_json$data$0$imageUrl = (_json$data2 = json.data) == null || (_json$data2 = _json$data2[0]) == null ? void 0 : _json$data2.imageUrl) != null ? _json$data$0$imageUrl : null;
}

/** Page through every public server of a game. */
async function getPublicServers(placeId, onProgress, onRateLimit) {
  const servers = [];
  let cursor = '';
  do {
    var _json$data3, _json$nextPageCursor;
    const res = await fetchWithRetry(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=${cursor}`, {
      headers: COMMON_HEADERS,
      referrer: 'https://www.roblox.com/',
      method: 'GET',
      mode: 'cors',
      credentials: 'include'
    }, onRateLimit);
    if (!res.ok) throw new Error(`Server list failed (${res.status})`);
    const json = await res.json();
    servers.push(...((_json$data3 = json.data) != null ? _json$data3 : []));
    onProgress == null || onProgress(servers.length);
    cursor = (_json$nextPageCursor = json.nextPageCursor) != null ? _json$nextPageCursor : '';
  } while (cursor);
  return servers;
}
async function fetchHeadshotBatch(items, onRateLimit) {
  var _json$data4;
  const res = await fetchWithRetry('https://thumbnails.roblox.com/v1/batch', {
    headers: _extends({}, COMMON_HEADERS, {
      'content-type': 'application/json'
    }),
    referrer: 'https://www.roblox.com/',
    body: JSON.stringify(items),
    method: 'POST',
    mode: 'cors',
    credentials: 'omit'
  }, onRateLimit);
  if (!res.ok) throw new Error(`Batch thumbnail failed (${res.status})`);
  const json = await res.json();
  return (_json$data4 = json.data) != null ? _json$data4 : [];
}

/**
 * Search the given servers for the target user's headshot.
 * Returns the first server whose player list contains a matching headshot.
 */
async function findUserInServers(servers, targetImageUrl, onProgress, onRateLimit) {
  const targetHash = headshotHash(targetImageUrl);

  // Build a unique requestId per token so we can map each result back to the
  // server it belongs to, regardless of response ordering.
  const tokenToServer = new Map();
  const items = [];
  servers.forEach((server, si) => {
    server.playerTokens.forEach((token, ti) => {
      const requestId = `${si}:${ti}`;
      tokenToServer.set(requestId, server);
      items.push({
        token,
        type: 'AvatarHeadshot',
        size: '150x150',
        requestId
      });
    });
  });
  const CHUNK = 100;
  const total = items.length;
  let done = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const results = await fetchHeadshotBatch(chunk, onRateLimit);
    for (const result of results) {
      if (!result.imageUrl) continue;
      if (headshotHash(result.imageUrl) === targetHash) {
        const server = tokenToServer.get(result.requestId);
        if (server) return {
          server,
          imageUrl: result.imageUrl
        };
      }
    }
    done += chunk.length;
    onProgress == null || onProgress(done, total);
  }
  return null;
}

/** Extract the numeric place id from a /games/<id>/... url. */
function getPlaceIdFromUrl(url) {
  const match = url.match(/\/games\/(\d+)/);
  return match ? match[1] : null;
}

var _tmpl$ = /*#__PURE__*/template(`<div>`),
  _tmpl$2 = /*#__PURE__*/template(`<div><div>rogrep — find a user in a server</div><form><input type=text placeholder="Roblox username"><button type=submit></button></form><div>`),
  _tmpl$3 = /*#__PURE__*/template(`<div><img alt><div><div> (@<!>)</div><div>Found in a server ✓</div><div>Players: <!>/<!> · Ping: <!>ms</div><div></div><a target=_blank rel=noreferrer>Join server`),
  _tmpl$4 = /*#__PURE__*/template(`<div><img alt><div><div> (@<!>)</div><div>Not found in any public server.`);
function Rogrep() {
  const [username, setUsername] = createSignal('');
  const [status, setStatus] = createSignal({
    kind: 'idle'
  });
  const busy = () => status().kind === 'loading';

  // Attach a direct (non-delegated) mousedown listener so it fires during
  // native bubbling and stops the panel's drag handler from calling
  // preventDefault, which would otherwise block focusing the input.
  const stopDrag = el => {
    el.addEventListener('mousedown', e => e.stopPropagation());
  };
  const search = async () => {
    const name = username().trim();
    if (!name) {
      ui.showToast('Enter a username first', {
        theme: 'dark'
      });
      return;
    }
    const placeId = getPlaceIdFromUrl(location.href);
    if (!placeId) {
      setStatus({
        kind: 'error',
        message: 'Could not detect a game id in the URL.'
      });
      return;
    }

    // Shows a live countdown while a rate-limited request waits to retry.
    let countdownTimer;
    const clearCountdown = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
    };
    const onRateLimit = ({
      waitMs
    }) => {
      clearCountdown();
      let remaining = Math.ceil(waitMs / 1000);
      const show = () => setStatus({
        kind: 'loading',
        message: `Rate limited (429) — retrying in ${remaining}s…`
      });
      show();
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdown();
          return;
        }
        show();
      }, 1000);
    };
    // Wrap progress callbacks so they cancel any active countdown.
    const progress = status => {
      clearCountdown();
      setStatus(status);
    };
    try {
      progress({
        kind: 'loading',
        message: `Looking up "${name}"…`
      });
      const user = await resolveUsername(name, onRateLimit);
      if (!user) {
        clearCountdown();
        setStatus({
          kind: 'error',
          message: `No user found named "${name}".`
        });
        return;
      }
      progress({
        kind: 'loading',
        message: 'Fetching avatar…'
      });
      const avatar = await getUserHeadshot(user.id, onRateLimit);
      if (!avatar) {
        clearCountdown();
        setStatus({
          kind: 'error',
          message: 'Could not load the user avatar.'
        });
        return;
      }
      progress({
        kind: 'loading',
        message: 'Loading servers…'
      });
      const servers = await getPublicServers(placeId, count => {
        progress({
          kind: 'loading',
          message: `Loading servers… (${count})`
        });
      }, onRateLimit);
      progress({
        kind: 'loading',
        message: `Scanning ${servers.length} servers…`
      });
      const match = await findUserInServers(servers, avatar, (done, total) => {
        progress({
          kind: 'loading',
          message: `Scanning players… (${done}/${total})`
        });
      }, onRateLimit);
      clearCountdown();
      if (match) {
        setStatus({
          kind: 'found',
          user,
          avatar,
          match
        });
      } else {
        setStatus({
          kind: 'not-found',
          user,
          avatar
        });
      }
    } catch (err) {
      clearCountdown();
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err)
      });
    }
  };
  const joinUrl = serverId => {
    const placeId = getPlaceIdFromUrl(location.href);
    return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
  };
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$3.nextSibling;
    _el$3.addEventListener("submit", e => {
      e.preventDefault();
      search();
    });
    use(stopDrag, _el$3);
    _el$4.$$input = e => setUsername(e.currentTarget.value);
    insert(_el$5, () => busy() ? 'Searching…' : 'Search');
    use(stopDrag, _el$6);
    insert(_el$6, createComponent(Show, {
      get when() {
        return status().kind === 'loading';
      },
      get children() {
        var _el$7 = _tmpl$();
        insert(_el$7, () => status().message);
        createRenderEffect(() => className(_el$7, styles.loading));
        return _el$7;
      }
    }), null);
    insert(_el$6, createComponent(Show, {
      get when() {
        return status().kind === 'error';
      },
      get children() {
        var _el$8 = _tmpl$();
        insert(_el$8, () => status().message);
        createRenderEffect(() => className(_el$8, styles.error));
        return _el$8;
      }
    }), null);
    insert(_el$6, createComponent(Show, {
      get when() {
        return status().kind === 'found';
      },
      get children() {
        return (() => {
          const s = status();
          return (() => {
            var _el$9 = _tmpl$3(),
              _el$0 = _el$9.firstChild,
              _el$1 = _el$0.nextSibling,
              _el$10 = _el$1.firstChild,
              _el$11 = _el$10.firstChild,
              _el$13 = _el$11.nextSibling;
              _el$13.nextSibling;
              var _el$14 = _el$10.nextSibling,
              _el$15 = _el$14.nextSibling,
              _el$16 = _el$15.firstChild,
              _el$21 = _el$16.nextSibling,
              _el$17 = _el$21.nextSibling,
              _el$22 = _el$17.nextSibling,
              _el$18 = _el$22.nextSibling,
              _el$23 = _el$18.nextSibling;
              _el$23.nextSibling;
              var _el$24 = _el$15.nextSibling,
              _el$25 = _el$24.nextSibling;
            insert(_el$10, () => s.user.displayName, _el$11);
            insert(_el$10, () => s.user.name, _el$13);
            insert(_el$15, () => s.match.server.playing, _el$21);
            insert(_el$15, () => s.match.server.maxPlayers, _el$22);
            insert(_el$15, () => Math.round(s.match.server.ping), _el$23);
            insert(_el$24, () => s.match.server.id);
            createRenderEffect(_p$ => {
              var _v$9 = styles.card,
                _v$0 = styles.avatar,
                _v$1 = s.avatar,
                _v$10 = styles.info,
                _v$11 = styles.name,
                _v$12 = styles.found,
                _v$13 = styles.meta,
                _v$14 = styles.serverId,
                _v$15 = styles.join,
                _v$16 = joinUrl(s.match.server.id);
              _v$9 !== _p$.e && className(_el$9, _p$.e = _v$9);
              _v$0 !== _p$.t && className(_el$0, _p$.t = _v$0);
              _v$1 !== _p$.a && setAttribute(_el$0, "src", _p$.a = _v$1);
              _v$10 !== _p$.o && className(_el$1, _p$.o = _v$10);
              _v$11 !== _p$.i && className(_el$10, _p$.i = _v$11);
              _v$12 !== _p$.n && className(_el$14, _p$.n = _v$12);
              _v$13 !== _p$.s && className(_el$15, _p$.s = _v$13);
              _v$14 !== _p$.h && className(_el$24, _p$.h = _v$14);
              _v$15 !== _p$.r && className(_el$25, _p$.r = _v$15);
              _v$16 !== _p$.d && setAttribute(_el$25, "href", _p$.d = _v$16);
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined,
              i: undefined,
              n: undefined,
              s: undefined,
              h: undefined,
              r: undefined,
              d: undefined
            });
            return _el$9;
          })();
        })();
      }
    }), null);
    insert(_el$6, createComponent(Show, {
      get when() {
        return status().kind === 'not-found';
      },
      get children() {
        return (() => {
          const s = status();
          return (() => {
            var _el$26 = _tmpl$4(),
              _el$27 = _el$26.firstChild,
              _el$28 = _el$27.nextSibling,
              _el$29 = _el$28.firstChild,
              _el$30 = _el$29.firstChild,
              _el$32 = _el$30.nextSibling;
              _el$32.nextSibling;
              var _el$33 = _el$29.nextSibling;
            insert(_el$29, () => s.user.displayName, _el$30);
            insert(_el$29, () => s.user.name, _el$32);
            createRenderEffect(_p$ => {
              var _v$17 = styles.card,
                _v$18 = styles.avatar,
                _v$19 = s.avatar,
                _v$20 = styles.info,
                _v$21 = styles.name,
                _v$22 = styles.notFound;
              _v$17 !== _p$.e && className(_el$26, _p$.e = _v$17);
              _v$18 !== _p$.t && className(_el$27, _p$.t = _v$18);
              _v$19 !== _p$.a && setAttribute(_el$27, "src", _p$.a = _v$19);
              _v$20 !== _p$.o && className(_el$28, _p$.o = _v$20);
              _v$21 !== _p$.i && className(_el$29, _p$.i = _v$21);
              _v$22 !== _p$.n && className(_el$33, _p$.n = _v$22);
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined,
              i: undefined,
              n: undefined
            });
            return _el$26;
          })();
        })();
      }
    }), null);
    createRenderEffect(_p$ => {
      var _v$ = styles.root,
        _v$2 = styles.header,
        _v$3 = styles.form,
        _v$4 = styles.input,
        _v$5 = busy(),
        _v$6 = styles.button,
        _v$7 = busy(),
        _v$8 = styles.result;
      _v$ !== _p$.e && className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && className(_el$3, _p$.a = _v$3);
      _v$4 !== _p$.o && className(_el$4, _p$.o = _v$4);
      _v$5 !== _p$.i && (_el$4.disabled = _p$.i = _v$5);
      _v$6 !== _p$.n && className(_el$5, _p$.n = _v$6);
      _v$7 !== _p$.s && (_el$5.disabled = _p$.s = _v$7);
      _v$8 !== _p$.h && className(_el$6, _p$.h = _v$8);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined
    });
    createRenderEffect(() => _el$4.value = username());
    return _el$;
  })();
}

// Inject CSS
GM_addStyle(css_248z);
const panel = ui.getPanel({
  theme: 'dark',
  style: stylesheet
});
Object.assign(panel.wrapper.style, {
  top: '80px',
  right: '20px',
  zIndex: '99999'
});
panel.setMovable(true);

// A small launcher button to toggle the panel.
const launcher = document.createElement('button');
launcher.textContent = 'rogrep';
Object.assign(launcher.style, {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  zIndex: '99999',
  padding: '10px 16px',
  borderRadius: '9999px',
  border: 'none',
  background: '#335fff',
  color: '#fff',
  fontWeight: '600',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
});
let visible = false;
const toggle = () => {
  visible = !visible;
  if (visible) panel.show();else panel.hide();
};
launcher.addEventListener('click', toggle);
document.body.appendChild(launcher);
render(Rogrep, panel.body);
delegateEvents(["input"]);

})(VM);
