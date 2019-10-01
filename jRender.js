const jRender = function () {
  const DELAY_TO_CHECK = 50;

  const componentInstanceMap = new Map;
  const componentMap = new Map();

  const getPropsAndMethods = (obj) => {
    let properties = new Set()
    let currentObj = obj

    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    } while ((currentObj = Object.getPrototypeOf(currentObj)))

    const defaultMethods = [
      'constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty',
      '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable',
      'toString', 'valueOf', 'toLocaleString', '__proto__'
    ];

    return [...properties.keys()].filter(item => defaultMethods.indexOf(item) === -1);
  }

  const setElementsInController = (e, controller) => {
    const name = e.getAttribute('#name');

    const listProps = name.split('.');
    let lastObject = controller;
    for (let i = -1, s = listProps.length; ++i < s;) {
      lastObject[listProps[i]] = i + 1 === s ? e : (lastObject = {});
    }

    controller[name] = e;
  };

  this.component = function () {
    const insert = data => {
      const docFrag = document.createRange().createContextualFragment(data);
      const c = docFrag.querySelector('component');
      const cName = c.getAttribute('name');

      if (!cName) {
        throw Error(`Define um nome para o componente.`);
      }

      if (componentMap.get(cName)) {
        throw Error(`Já existe um componente com o nome '${cName}'.`);
      }

      const script = docFrag.querySelector('script');
      if (script) {
        document.body.appendChild(script);
        script.remove();
      }

      if (!c.getAttribute('controller')) {
        throw new Error(`Define o nome do controlador para o componente ${cName}.`);
      }

      const componentClass = eval(c.getAttribute('controller'));
      if (!componentClass) {
        throw new Error(`Não existe definição para classe com o nome '${c.getAttribute('controller')}'.`);
      }

      const __controllerObj = new componentClass;

      const names = c.querySelectorAll('[\\#name]');
      if (names) {
        for (const e of names) setElementsInController(e, __controllerObj);
      }

      const o = {
        name: cName,
        controllerClass: componentClass,
        htmlContent: c.innerHTML,
        functionBodyString: (() => {
          let action = '';
          for (const attr of getPropsAndMethods(__controllerObj)) {
            const refPropStr = `this.${attr}`;
            action += `${attr}=${refPropStr} && ${refPropStr}.bind ? ${refPropStr}.bind(this) : ${refPropStr},`;
          }
          return `var ${action.substring(0, action.length - 1)};return `
        })()
      };

      componentMap.set(o.name, o);

      return o;
    };

    this.load = path => {
      return fetch(path).then(res => {
        if (res.ok) {
          return res.text().then(html => {
            insert(html);
            return Promise.resolve(this);
          });
        }

        return Promise.reject(new Error('Failed to load.'));
      });
    };

    const _processAttributes = (el, o) => {
      const cEL = el.querySelector(o.name);
      if (!cEL) return;

      cEL.innerHTML = o.htmlContent;

      const controllerObj = new o.controllerClass;

      let indexName = 'index';
      let varName = undefined;

      let isDestroyed = null;

      Object.defineProperty(controllerObj, 'isDestroyed', {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => isDestroyed !== null ? isDestroyed : !classStyleObj.isVisible(cEL)
      });

      const attrsForDestroy = {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => {
          if (isDestroyed === true) return;

          cEL.remove();
          isDestroyed = true;

          componentInstanceMap.delete(controllerObj._uuid);

          if (controllerObj.onDestroy) controllerObj.onDestroy.call(controllerObj);
        }
      };

      Object.defineProperty(cEL, 'destroy', attrsForDestroy);
      Object.defineProperty(controllerObj, 'destroy', attrsForDestroy);

      const action = o.functionBodyString;
      const allEls = cEL.querySelectorAll('*');
      const ctx = {
        el: cEL,
        controller: controllerObj,
        attrs: [],
        processing: true
      };

      for (const _el of allEls) {
        if (_el.tagName === 'FORM') {
          const _reset = _el.reset;
          let isDirty = false;

          _el.reset = () => {
            isDirty = false;

            const inputEls = _el.querySelectorAll('input, textarea, button');
            if (inputEls) {
              for (const input of inputEls) {
                input.isDirty = false;
                input.isTouched = false;
              }
            }

            _reset.call(_el);
            this.checkModifications(controllerObj);
          };

          Object.defineProperty(_el, 'isDirty', {
            get: () => {
              return isDirty
            },
            set: (v) => {
              isDirty = v;

              if (v === false) {
                const inputEls = _el.querySelectorAll('input, textarea, button');
                if (inputEls) {
                  for (const input of inputEls) input.isDirty = v;
                }
              }
            }
          });
        } else if (_el.tagName === 'INPUT' || _el.tagName === 'TEXTAREA') {
          let isDirty = false;
          let isTouched = false;

          Object.defineProperty(_el, 'isDirty', {
            get: () => isDirty,
            set: (v) => isDirty = v
          });

          Object.defineProperty(_el, 'isTouched', {
            get: () => isTouched,
            set: (v) => isTouched = v
          });

          const evtTouched = function () {
            this.isTouched = true;
            this.removeEventListener('blur', evtTouched);
          };
          _el.addEventListener('blur', evtTouched);

          const evtDirty = function () {
            this.isDirty = true;
            if (this.form) this.form.isDirty = true;
          };

          _el.addEventListener('keypress', evtDirty);
          _el.addEventListener('change', evtDirty);
        }

        for (const attr of _el.attributes) {
          const nodeName = attr.nodeName;
          if (nodeName === '#name') {
            setElementsInController(_el, controllerObj);
          } else if (nodeName === 'if') {
            ctx.attrs.push({
              el: _el,
              name: nodeName,
              value: attr.nodeValue,
              action: new Function('$_el', indexName, varName, action + attr.nodeValue)
            });
          } else if (nodeName.indexOf('.') > -1) {
            const dataAttr = nodeName.split('.');
            const type = dataAttr[0];

            if (type === 'event') {
              const fnc = new Function('$event', action + attr.nodeValue);
              _el.addEventListener(nodeName.substring(6), (e) => {
                fnc.call(controllerObj, e);
              });
            } else {
              ctx.attrs.push({
                el: _el,
                type: type,
                name: dataAttr[1],
                value: attr.nodeValue,
                action: new Function('$_el', indexName, varName, action + attr.nodeValue)
              });
            }
          }
        }
      }

      const id = uID();

      controllerObj._uuid = id;
      componentInstanceMap.set(id, ctx);

      this.process(cEL);

      if (controllerObj.onInit) controllerObj.onInit.call(controllerObj);

      setTimeout(() => {
        ctx.processing = false;

        this.checkModifications(controllerObj);
      });
    };

    this.process = el => componentMap.forEach(o => _processAttributes(el, o));

    const classStyleObj = {
      isVisible: (e) => {
        return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      },
      hasClass: (elem, className) => {
        return new RegExp(' ' + className + ' ').test(' ' + elem.className + ' ');
      },
      addClass: (elem, className) => {
        if (!classStyleObj.hasClass(elem, className)) {
          elem.className += ' ' + className;
        }
      },
      removeClass: (elem, className) => {
        if (classStyleObj.hasClass(elem, className)) {
          let newClass = ' ' + elem.className.replace(/[\t\r\n]/g, ' ') + ' ';
          while (newClass.indexOf(' ' + className + ' ') >= 0) {
            newClass = newClass.replace(' ' + className + ' ', ' ');
          }
          elem.className = newClass.replace(/^\s+|\s+$/g, '');
        }
      }
    };

    const checkAttrs = (ctx, index, value) => {
      const controller = ctx.controller;
      for (attr of ctx.attrs) {
        const el = attr.el;

        if (!ctx.processing) {
          if (attr.name === 'if') {
            if (!classStyleObj.isVisible(el.parentNode)) continue;
          } else if (!classStyleObj.isVisible(el)) {
            continue;
          };
        }

        const v = attr.action.call(controller, el, index, value);

        if (attr.oldValue === v) continue;

        if (attr.name === 'if') {
          const currentStyle = el.style.display;
          if (v) {
            if (currentStyle === 'none') {
              el.style.display = attr.defaultDisplay || 'block';
            }
          } else {
            attr.defaultDisplay = currentStyle;
            el.style.display = 'none';
          }
        } else if (attr.name === 'styleClass') {
          classStyleObj.removeClass(el, attr.oldValue);
          classStyleObj.addClass(el, v);
        } else if (attr.type) {
          if (attr.type === 'class') {
            const _classStyle = attr.name.replace(new RegExp(':', 'g'), ' ');
            if (v) {
              classStyleObj.addClass(el, _classStyle);
            } else {
              classStyleObj.removeClass(el, _classStyle);
            }
          } else if (attr.type === 'attr') {
            el.setAttribute(attr.name, v);
          } else if (attr.type === 'style') {
            el.style[attr.name] = v;
          } else if (attr.type === 'prop') {
            if (attr.name === 'innerhtml') attr.name = 'innerHTML';
            else if (attr.name === 'innertext') attr.name = 'innerText';
            else if (attr.name === 'textcontent') attr.name = 'textContent';

            el[attr.name] = v;
          }
        }

        if (controller.onChange) {
          controller.onChange.call(controller, el, attr.oldValue, v);
        }

        attr.oldValue = v;
      }
    };

    this.checkModifications = (controller) => {
      const cxt = componentInstanceMap.get(controller._uuid);
      if (!cxt) return;

      setTimeout(() => {
        const el = cxt.el;
        if (el.varName) { // FOR
        } else checkAttrs(cxt);
      });

      if (controller.onCheck) controller.onCheck();
    };

    let executingReact = false;

    const eventToCheck = () => {
      if (executingReact) return;

      executingReact = true;

      for (let c of componentInstanceMap.values()) {
        const controller = c.controller;
        if (controller.isDestroyed()) {
          controller.destroy();
        }

        this.checkModifications(controller);
      }

      setTimeout(() => {
        executingReact = false;
      }, DELAY_TO_CHECK);
    };

    document.addEventListener('mousemove', eventToCheck);
    document.addEventListener('keydown', eventToCheck);

    return this;
  }.call({});

  const uID = () => {
    const array = new Uint32Array(8)
    window.crypto.getRandomValues(array);

    let str = '';
    for (let i = -1, s = array.length; ++i < s;) {
      str += (i < 2 || i > 5 ? '' : '-') + array[i].toString(16).slice(-4);
    }
    return str
  }

  return this;
}.call({});