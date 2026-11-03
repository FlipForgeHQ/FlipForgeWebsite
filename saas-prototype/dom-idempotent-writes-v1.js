/* FlipForge customer app: idempotent DOM writes (v1).
 *
 * Problem this replaces: dozens of layers each hand-rolled their own "write only when the value differs" helper,
 * and many missed it. Re-setting an attribute, class or text to the value it already has still notifies every
 * MutationObserver, and ~40 page-wide observers then re-ran and re-wrote, producing endless 60 fps redraws on
 * Saved Decision, Tracking, Evidence and Forge Heat.
 *
 * This is the single, central version of that rule. A write that would leave the DOM byte-for-byte identical is
 * skipped; every other write is performed exactly as before. Deliberately NOT covered: innerHTML / outerHTML /
 * insertAdjacentHTML / node insertion and removal (re-creating nodes can attach fresh listeners, so skipping could
 * change behaviour). Presentation-only: no data, decision, evidence or permission logic lives here.
 */
(() => {
  "use strict";
  if (window.__FlipForgeIdempotentWrites) return;
  window.__FlipForgeIdempotentWrites = "v1";

  const elementProto = Element.prototype;
  const nativeSetAttribute = elementProto.setAttribute;
  const nativeRemoveAttribute = elementProto.removeAttribute;
  const nativeToggleAttribute = elementProto.toggleAttribute;
  const nativeGetAttribute = elementProto.getAttribute;
  const nativeHasAttribute = elementProto.hasAttribute;

  elementProto.setAttribute = function setAttribute(name, value) {
    if (nativeGetAttribute.call(this, name) === String(value)) return undefined;
    return nativeSetAttribute.call(this, name, value);
  };
  elementProto.removeAttribute = function removeAttribute(name) {
    if (!nativeHasAttribute.call(this, name)) return undefined;
    return nativeRemoveAttribute.call(this, name);
  };
  if (nativeToggleAttribute) {
    elementProto.toggleAttribute = function toggleAttribute(name, force) {
      const present = nativeHasAttribute.call(this, name);
      if (force === true && present) return true;
      if (force === false && !present) return false;
      return nativeToggleAttribute.apply(this, arguments);
    };
  }

  // Reflected boolean / string properties: skip when unchanged.
  const guardProperty = (proto, property) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (!descriptor || !descriptor.get || !descriptor.set) return;
    Object.defineProperty(proto, property, {
      ...descriptor,
      set(value) {
        if (descriptor.get.call(this) === value) return;
        descriptor.set.call(this, value);
      }
    });
  };
  [[HTMLElement.prototype, "hidden"], [HTMLElement.prototype, "tabIndex"], [HTMLElement.prototype, "title"],
    [HTMLElement.prototype, "lang"], [Element.prototype, "className"], [Element.prototype, "id"],
    [HTMLDetailsElement.prototype, "open"], [HTMLAnchorElement.prototype, "href"],
    [HTMLInputElement.prototype, "placeholder"], [HTMLTextAreaElement.prototype, "placeholder"]]
    .forEach(([proto, property]) => guardProperty(proto, property));

  // Class list: add/remove/toggle that would not change the class attribute still records a mutation.
  const tokens = DOMTokenList.prototype;
  const nativeAdd = tokens.add;
  const nativeRemove = tokens.remove;
  const nativeToggle = tokens.toggle;
  const nativeContains = tokens.contains;
  tokens.add = function add(...values) {
    if (values.every(value => nativeContains.call(this, value))) return undefined;
    return nativeAdd.apply(this, values);
  };
  tokens.remove = function remove(...values) {
    if (values.every(value => !nativeContains.call(this, value))) return undefined;
    return nativeRemove.apply(this, values);
  };
  tokens.toggle = function toggle(value, force) {
    const present = nativeContains.call(this, value);
    if (force === true && present) return true;
    if (force === false && !present) return false;
    return nativeToggle.apply(this, arguments);
  };

  // Text: only when the node already holds exactly that text and nothing else (no child elements are lost).
  const holdsOnly = (node, text) => {
    const children = node.childNodes;
    if (text === "") return children.length === 0;
    return children.length === 1 && children[0].nodeType === Node.TEXT_NODE && children[0].nodeValue === text;
  };
  const textDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  if (textDescriptor?.set) {
    Object.defineProperty(Node.prototype, "textContent", {
      ...textDescriptor,
      set(value) {
        const text = value == null ? "" : String(value);
        if ((this.nodeType === Node.ELEMENT_NODE || this.nodeType === Node.DOCUMENT_FRAGMENT_NODE) && holdsOnly(this, text)) return;
        if ((this.nodeType === Node.TEXT_NODE || this.nodeType === Node.COMMENT_NODE) && this.nodeValue === text) return;
        textDescriptor.set.call(this, value);
      }
    });
  }
  const innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");
  if (innerTextDescriptor?.set) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      ...innerTextDescriptor,
      set(value) {
        const text = value == null ? "" : String(value);
        if (!/\n/.test(text) && holdsOnly(this, text)) return;
        innerTextDescriptor.set.call(this, value);
      }
    });
  }
  const nodeValueDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "nodeValue");
  if (nodeValueDescriptor?.set) {
    Object.defineProperty(Node.prototype, "nodeValue", {
      ...nodeValueDescriptor,
      set(value) {
        if (this.nodeType !== Node.ELEMENT_NODE && nodeValueDescriptor.get.call(this) === (value == null ? "" : String(value))) return;
        nodeValueDescriptor.set.call(this, value);
      }
    });
  }

  // dataset: element.dataset.x = sameValue still rewrites the data-* attribute.
  const datasetDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "dataset");
  if (datasetDescriptor?.get) {
    const proxies = new WeakMap();
    Object.defineProperty(HTMLElement.prototype, "dataset", {
      ...datasetDescriptor,
      get() {
        const map = datasetDescriptor.get.call(this);
        let proxy = proxies.get(map);
        if (!proxy) {
          proxy = new Proxy(map, {
            get: (target, key) => Reflect.get(target, key),
            set: (target, key, value) => {
              if (typeof key === "string" && target[key] === String(value)) return true;
              return Reflect.set(target, key, value);
            },
            deleteProperty: (target, key) => (typeof key === "string" && !(key in target)) ? true : Reflect.deleteProperty(target, key),
            has: (target, key) => Reflect.has(target, key),
            ownKeys: target => Reflect.ownKeys(target),
            getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key)
          });
          proxies.set(map, proxy);
        }
        return proxy;
      }
    });
  }
})();
