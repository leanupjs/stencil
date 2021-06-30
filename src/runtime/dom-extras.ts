import type * as d from '../declarations';
import { BUILD } from '@app-data';
import { HOST_FLAGS } from '@utils';
import { PLATFORM_FLAGS } from './runtime-constants';
import { plt, getHostRef } from '@platform';
import { updateFallbackSlotVisibility } from './vdom/render-slot-fallback';

export const patchCloneNode = (HostElementPrototype: any) => {
  const orgCloneNode = HostElementPrototype.cloneNode;

  HostElementPrototype.cloneNode = function (deep?: boolean) {
    const srcNode: d.HostElement = this;
    const clonedNode: d.HostElement = orgCloneNode.call(srcNode, false) as d.HostElement;
    if (BUILD.slot && deep) {
      let i = 0;
      let slotted, nonStencilNode;
      let stencilPrivates = ['s-id', 's-cr', 's-lr', 's-rc', 's-sc', 's-p', 's-cn', 's-sr', 's-sn', 's-hn', 's-ol', 's-nr', 's-si', 's-sf', 's-sfc', 's-hsf'];

      for (; i < srcNode.__childNodes.length; i++) {
        slotted = (srcNode.__childNodes[i] as any)['s-nr'];
        nonStencilNode = stencilPrivates.every((privateField) => !(srcNode.__childNodes[i] as any)[privateField]);

        if (slotted) {
          clonedNode.__appendChild(slotted.cloneNode(true));
        }
        if (nonStencilNode){
          clonedNode.__appendChild((srcNode.__childNodes[i] as any).cloneNode(true));
        }
      }
    }
    return clonedNode;
  };
};

export const patchPseudoShadowDom = (HostElementPrototype: any) => {
  patchChildSlotNodes(HostElementPrototype);
  patchSlotAppendChild(HostElementPrototype);
  patchSlotAppend(HostElementPrototype);
  patchSlotPrepend(HostElementPrototype);
  patchSlotInsertAdjacentHTML(HostElementPrototype);
  patchSlotInsertAdjacentText(HostElementPrototype);
  patchSlotInsertAdjacentElement(HostElementPrototype);
  patchSlotReplaceChildren(HostElementPrototype);
  patchSlotInnerHTML(HostElementPrototype);
  patchSlotInnerText(HostElementPrototype);
}

const patchChildSlotNodes = (HostElementPrototype: any) => {
  class FakeNodeList extends Array {
    item(n: number) {
      return this[n];
    }
  }
  const childNodesFn = HostElementPrototype.__lookupGetter__('childNodes');
  const childrenFn = HostElementPrototype.__lookupGetter__('children');
  const childElementCountFn = HostElementPrototype.__lookupGetter__('childElementCount');

  // MockNode won't have these
  if (childrenFn) {
    Object.defineProperty(HostElementPrototype, '__children', {
      get() {
        return childrenFn.call(this);
      }
    });
  }
  if (childElementCountFn) {
    Object.defineProperty(HostElementPrototype, '__childElementCount', {
      get() {
        return childElementCountFn.call(this);
      }
    });
  }
  if (childNodesFn) {
    Object.defineProperty(HostElementPrototype, '__childNodes', {
      get() {
        return childNodesFn.call(this);
      }
    });
  }

  Object.defineProperty(HostElementPrototype, 'children', {
    get() {
      return (this.childNodes as FakeNodeList).flatMap((n: any) => {
        if (n.nodeType === 1) return n;
        else return [];
      });
    },
  });
  Object.defineProperty(HostElementPrototype, 'childElementCount', {
    get() {
      return HostElementPrototype.children.length;
    },
  });
  if (!childNodesFn) return;

  Object.defineProperty(HostElementPrototype, 'childNodes', {
    get() {
      const childNodes = childNodesFn.call(this);
      if ((plt.$flags$ & PLATFORM_FLAGS.isTmpDisconnected) === 0 && getHostRef(this).$flags$ & HOST_FLAGS.hasRendered) {
        const result = new FakeNodeList();
        for (let i = 0; i < childNodes.length; i++) {
          const slot = childNodes[i]['s-nr'];
          if (slot) {
            result.push(slot);
          }
        }
        return result;
      }
      return FakeNodeList.from(childNodes);
    }
  });
};

const patchSlotInnerHTML = (HostElementPrototype: any) => {
  const innerHTMLGetFn = HostElementPrototype.__lookupGetter__('innerHTML');
  const innerHTMLSetFn = HostElementPrototype.__lookupSetter__('innerHTML');

  Object.defineProperty(HostElementPrototype, '__innerHTML', {
    get() {
      return innerHTMLGetFn.call(this);
    },
    set(value) {
      return innerHTMLSetFn.call(this, value);
    }
  });

  Object.defineProperty(HostElementPrototype, 'innerHTML', {
    get: function() {
      let html = '';
      this.childNodes.forEach((node: d.RenderNode) => html+= node.outerHTML || node.textContent);
      return html;
    },
    set: function(value) {
      this.childNodes.forEach((node: d.RenderNode) => {
        if (node['s-ol']) node['s-ol'].remove();
        node.remove();
      });
      this.insertAdjacentHTML('beforeend', value);
    }
  })
};

const patchSlotInnerText = (HostElementPrototype: any) => {
  const innerTextGetFn = HostElementPrototype.__lookupGetter__('innerText');
  const innerTextSetFn = HostElementPrototype.__lookupSetter__('innerText');

  Object.defineProperty(HostElementPrototype, '__innerText', {
    get() {
      return innerTextGetFn.call(this);
    },
    set(value) {
      return innerTextSetFn.call(this, value);
    }
  });

  Object.defineProperty(HostElementPrototype, 'innerText', {
    get: function() {
      let html = '';
      this.childNodes.forEach((node: d.RenderNode) => html+= node.innerText || node.textContent);
      return html;
    },
    set: function(value) {
      this.childNodes.forEach((node: d.RenderNode) => {
        if (node['s-ol']) node['s-ol'].remove();
        node.remove();
      });
      this.insertAdjacentHTML('beforeend', value);
    }
  })
};

export const patchNodeRemove = (ElementPrototype: any) => {
  if (ElementPrototype.__remove) return;
  ElementPrototype.__remove = ElementPrototype.remove || true;
  if (document.contains(ElementPrototype.parentNode)) patchNodeRemoveChild(ElementPrototype.parentNode);

  ElementPrototype.remove = function(this: Element) {
    if (this.parentNode) {
      return this.parentNode.removeChild(this);
    }
    return (this as any).__remove();
  }
}

const patchNodeRemoveChild = (ElementPrototype: any) => {
  if (ElementPrototype.__removeChild) return;
  ElementPrototype.__removeChild = ElementPrototype.removeChild;
  ElementPrototype.removeChild = function(this: d.RenderNode, toRemove: d.RenderNode) {
    if (toRemove['s-sn']) {
      const slotNode = getHostSlotNode((this.__childNodes || this.childNodes), toRemove['s-sn']);
      (this as any).__removeChild(toRemove);
      if (slotNode && slotNode['s-hsf']) updateFallbackSlotVisibility(this);
      return;
    }
    return (this as any).__removeChild(toRemove);
  }
}

const patchSlotAppendChild = (HostElementPrototype: any) => {
  if (HostElementPrototype.__appendChild) return;
  HostElementPrototype.__appendChild = HostElementPrototype.appendChild;
  HostElementPrototype.appendChild = function(this: d.HostElement, newChild: d.RenderNode) {
    const slotName = (newChild['s-sn'] = getSlotName(newChild));
    const slotNode = getHostSlotNode(this.__childNodes, slotName);
    if (slotNode) {
      const slotPlaceholder: d.RenderNode = document.createTextNode('') as any;
      slotPlaceholder['s-nr'] = newChild;
      ((slotNode['s-cr']).parentNode as any).__appendChild(slotPlaceholder);
      newChild['s-ol'] = slotPlaceholder;
      patchNodeRemove(newChild);

      const slotChildNodes = getHostSlotChildNodes(slotNode, slotName);
      const appendAfter = slotChildNodes[slotChildNodes.length - 1];
      appendAfter.parentNode.insertBefore(newChild, appendAfter.nextSibling);
      patchNodeRemoveChild(newChild.parentNode);

      if (slotNode['s-hsf']) updateFallbackSlotVisibility(slotNode.parentNode as d.RenderNode);
      return;
    }
    if (newChild.nodeType === 1 && !!newChild.getAttribute('slot') && this.__childNodes) newChild.hidden = true;
    return (this as any).__appendChild(newChild);
  };
};

const patchSlotPrepend = (HostElementPrototype: any) => {
  if (HostElementPrototype.__prepend) return;
  HostElementPrototype.__prepend = HostElementPrototype.prepend;
  HostElementPrototype.prepend = function(this: d.HostElement, ...newChildren: (d.RenderNode | string)[]) {
    newChildren.forEach((newChild: d.RenderNode | string) => {
      if (typeof newChild === 'string') {
        newChild = this.ownerDocument.createTextNode(newChild) as unknown as d.RenderNode;
      }
      const slotName = (newChild['s-sn'] = getSlotName(newChild));
      const slotNode = getHostSlotNode(this.__childNodes, slotName);
      if (slotNode) {
        const slotPlaceholder: d.RenderNode = document.createTextNode('') as any;
        slotPlaceholder['s-nr'] = newChild;
        ((slotNode['s-cr']).parentNode as any).__appendChild(slotPlaceholder);
        newChild['s-ol'] = slotPlaceholder;
        patchNodeRemove(newChild);

        const slotChildNodes = getHostSlotChildNodes(slotNode, slotName);
        const appendAfter = slotChildNodes[0];
        appendAfter.parentNode.insertBefore(newChild, appendAfter.nextSibling);
        patchNodeRemoveChild(newChild.parentNode);

        if (slotNode['s-hsf']) updateFallbackSlotVisibility(slotNode.parentNode as d.RenderNode);
        return;
      }
      if (newChild.nodeType === 1 && !!newChild.getAttribute('slot') && this.__childNodes) newChild.hidden = true;
      return (this as any).__prepend(newChild);
    })
  };
};

const patchSlotAppend = (HostElementPrototype: any) => {
  if (HostElementPrototype.__append) return;
  HostElementPrototype.__append = HostElementPrototype.append;
  HostElementPrototype.append = function(this: d.HostElement, ...newChildren: (d.RenderNode | string)[]) {
    newChildren.forEach((newChild: d.RenderNode | string) => {
      if (typeof newChild === 'string') {
        newChild = this.ownerDocument.createTextNode(newChild) as unknown as d.RenderNode;
      }
      this.appendChild(newChild);
    })
  };
};

const patchSlotReplaceChildren = (HostElementPrototype: any) => {
  if (HostElementPrototype.__replaceChildren) return;
  HostElementPrototype.__replaceChildren = HostElementPrototype.replaceChildren;
  HostElementPrototype.replaceChildren = function(this: d.HostElement, ...newChildren: (Node | string)[]) {
    const slotNode = getHostSlotNode(this.__childNodes, '');
    if (slotNode) {
      const slotChildNodes = getHostSlotChildNodes(slotNode, '');
      slotChildNodes.forEach(node => {
        if (!node['s-sr']) { node.remove(); }
      });
      this.append(...newChildren);
    }
  }
}

const patchSlotInsertAdjacentHTML = (HostElementPrototype: any) => {
  if (HostElementPrototype.__insertAdjacentHTML) return;
  HostElementPrototype.__insertAdjacentHTML = HostElementPrototype.insertAdjacentHTML;
  HostElementPrototype.insertAdjacentHTML = function(this: d.HostElement, position: InsertPosition, text: string) {
    if (position !== 'afterbegin' && position !== 'beforeend') {
      return (this as any).__insertAdjacentHTML(position, text);
    }
    const container = this.ownerDocument.createElement('_');
    let node: d.RenderNode;
	  container.innerHTML = text;

    if (position === 'afterbegin') {
      while ((node = container.firstChild as d.RenderNode)) {
        this.prepend(node);
			}
    } else if (position === 'beforeend') {
      while ((node = container.firstChild as d.RenderNode)) {
				this.append(node);
			}
    }
  }
}

const patchSlotInsertAdjacentText = (HostElementPrototype: any) => {
  if (HostElementPrototype.__insertAdjacentText) return;
  HostElementPrototype.__insertAdjacentText = HostElementPrototype.insertAdjacentText;
  HostElementPrototype.insertAdjacentText = function(this: d.HostElement, position: InsertPosition, text: string) {
    this.insertAdjacentHTML(position, text);
  }
}

const patchSlotInsertAdjacentElement = (HostElementPrototype: any) => {
  if (HostElementPrototype.__insertAdjacentElement) return;
  HostElementPrototype.__insertAdjacentElement = HostElementPrototype.insertAdjacentElement;
  HostElementPrototype.insertAdjacentElement = function(this: d.HostElement, position: InsertPosition, element: d.RenderNode) {
    if (position !== 'afterbegin' && position !== 'beforeend') {
      return (this as any).__insertAdjacentElement(position, element);
    }
    if (position === 'afterbegin') {
      this.prepend(element);
    } else if (position === 'beforeend') {
      this.append(element);
    }
  }
}

const getSlotName = (node: d.RenderNode) => node['s-sn'] || (node.nodeType === 1 && ((node as Element).getAttribute('slot')) || node.slot) || '';

const getHostSlotNode = (childNodes: NodeListOf<ChildNode>, slotName: string) => {
  let i = 0;
  let childNode: d.RenderNode;
  if(!childNodes) return null;

  for (; i < childNodes.length; i++) {
    childNode = childNodes[i] as d.RenderNode;
    if (childNode['s-sr'] && childNode['s-sn'] === slotName) {
      return childNode;
    }
    childNode = getHostSlotNode(childNode.childNodes, slotName);
    if (childNode) {
      return childNode;
    }
  }
  return null;
};

const getHostSlotChildNodes = (n: d.RenderNode, slotName: string) => {
  const childNodes: d.RenderNode[] = [n];
  while ((n = n.nextSibling as any) && (n['s-sn'] === slotName)) {
    childNodes.push(n as any);
  }
  return childNodes;
};
