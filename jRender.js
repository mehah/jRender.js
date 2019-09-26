jRender = (function () {
  const componentInstanceList = [];

  const componentMap = new Map();

  this.component = (function () {

    const insert = (data) => {
      const docFrag = document.createRange().createContextualFragment(data);
      const c = docFrag.querySelector('component');
      const cName = c.getAttribute('name');

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

      const o = {
        name: cName,
        controllerClass: componentClass,
        htmlContent: c.innerHTML
      };

      componentMap.set(o.name, o);

      return o;
    };

    this.load = (path) => {
      return fetch(path)
        .then(response => {
          if (response.ok) {
            return response.text().then(html => {
              insert(html);
              return Promise.resolve(this);
            });
          }

          return Promise.reject(new Error('Failed to load.'));
        });
    };

    var _processAttributes = (el, o) => {
      const cEL = el.querySelector(o.name);
      if (!cEL) return;

      cEL.innerHTML = o.htmlContent;

      const controller = eval('new ' + o.controllerClass);

      const names = el.querySelectorAll('[\\#name]');
      if (names) {
        for (e of names) {
          controller[e.getAttribute('#name')] = e;
        }
      }

      componentInstanceList.push({
        el: cEL,
        controller: controller
      });

      this.process(cEL);
    };

    this.process = (el) => componentMap.forEach(o => _processAttributes(el, o));

    return this;
  }).call({});

  return this;
}).call({});
