var ComponentFactory = (function () {
  var DELAY_TO_CHECK = 50;

  var componentList = [],
    ComponentsCached = {},
    executingReact = false;

  var checkAttrs = function (handler, ctx, index, value) {
    for (var b = -1, s = ctx.attrs.length; ++b < s;) {
      var attr = ctx.attrs[b];

      if (!handler.processing) {
        if (attr.name === 'if') {
          if (!ctx.el.parent().is(':visible')) continue;
        } else if (!ctx.el.is(':visible')) continue;
      }

      (function () {
        var v = attr.action.call(handler.component, ctx.el, index, value);

        if (attr.oldValue === v) return;

        if (attr.name === 'if') {
          ctx.el[v ? 'show' : 'hide']();
        } else if (attr.name === 'styleClass') {
          ctx.el.removeClass(attr.oldValue).addClass(v);
        } else if (attr.type) {
          if (attr.type === 'class') {
            ctx.el[v ? 'addClass' : 'removeClass'](attr.name.replace(new RegExp(':', 'g'), ' '));
          } else {
            ctx.el[attr.type](attr.name, v);
          }
        }

        if (handler.component.onChange) {
          handler.component.onChange.call(handler.component, ctx.el, attr.oldValue, v);
        }

        attr.oldValue = v;
      })();
    }
  };

  var checkModifications = function (handler) {
    if (handler.isDestroyed()) return;

    setTimeout(function () {
      for (var i = -1, s = handler.els.length; ++i < s;) {
        var ctx = handler.els[i];

        if (ctx.varName) {
          var _ref = handler.component[ctx.ref],
            lastCtx = ctx,
            isModified = false;

          if (ctx.clones.length === 0) {
            for (var ii = -1, s = _ref.length; ++ii < s;) {
              checkAttrs(handler, lastCtx, ii, _ref[ii]);

              if (ii < s - 1) {
                var clone = ctx.el.clone();
                lastCtx.el.after(clone);
                lastCtx = {
                  el: clone,
                  attrs: ctx.attrs
                };
                ctx.clones.push(lastCtx);
              }
            }
          } else {}

          if (isModified) {
            ctx.original = _ref.slice(0);

            for (var ii = -1, s = _ref.length; ++ii < s;) {
              checkAttrs(handler, lastCtx, ii, _ref[ii]);

              if (ii < s - 1) {
                var clone = ctx.el.clone();
                lastCtx.el.after(clone);
                lastCtx = {
                  el: clone,
                  attrs: ctx.attrs
                };
                ctx.clones.push(lastCtx);
              }
            }
          }
        } else checkAttrs(handler, ctx);
      }
    });

    if (handler.component.onCheck) handler.component.onCheck();
  };

  $(document).on('mousemove keydown', function () {
    if (executingReact) return;

    executingReact = true;

    for (var i = -1, s = componentList.length; ++i < s;) {
      var c = componentList[i];
      if (c.isDestroyed()) {
        componentList.splice(i, 1);
        c.destroy();
        --i;
        --s;
        continue;
      }

      checkModifications(c);
    }

    setTimeout(function () {
      executingReact = false;
    }, DELAY_TO_CHECK);
  });

  var ComponentHandler = function (path) {
    var handler = this,
      content = null,
      isDestroyed = false;

    this.els = [];
    this.processing = true;

    var componentData = ComponentsCached[path];

    if (!componentData) {
      var $Component = function (tagName, clazz) {
        componentData = {
          tagName: tagName,
          clazz: clazz,
          html: null
        };

        ComponentsCached[path] = componentData;
      };
    }

    var load = function (target, html, onLoad) {
      if (componentData) {
        content = $('<' + componentData.tagName + ' />')
          .hide()
          .html(componentData.html);

        target.append(content);
      } else {
        window.$Component = $Component;
        var __content = $('<div />')
          .hide()
          .html(html);
        target.append(__content);

        try {
          delete window.$Component;
        } catch (e) {
          window['$Component'] = undefined;
        }

        content = $('<' + componentData.tagName + ' />')
          .hide()
          .append(__content.contents());
        __content.replaceWith(content);

        content.find('script').remove();
        componentData.html = content.html();
      }

      var c = new componentData.clazz();
      handler.component = c;

      content.find('[\\#name]').each(function () {
        this.name = this.getAttribute('#name');
        c[this.name] = this;

        if (this.reset) {
          var _reset = this.reset;
          this.reset = function () {
            _reset.call(this);
            $(this)
              .find(':input')
              .each(function () {
                this.isDirty = false;
                this.isTouched = false;
              });
            checkModifications(handler);
          };
        }
      });

      content
        .find(':input')
        .each(function () {
          if (this.form) this.form.isDirty = false;
          this.isDirty = false;
          this.isTouched = false;

          var evtTouched = function () {
            this.isTouched = true;
            $(this).off('blur', evtTouched);
          };
          $(this).on('blur', evtTouched);
        })
        .on('keypress change', function () {
          this.isDirty = true;
          if (this.form) this.form.isDirty = true;
        });

      content.find('form').each(function () {
        var isDirty = false;
        this.isDirty = function (i) {
          if (i === undefined) return isDirty;
          isDirty = i;
        };
      });

      if (c.onInit) c.onInit();

      var action = 'var ';
      for (var attr in c) {
        var refPropStr = 'this.' + attr;
        action += attr + '= ' + refPropStr + ' && ' + refPropStr + '.bind ? ' + refPropStr + '.bind(this) : ' + refPropStr + ',';
      }
      action = action.substring(0, action.length - 1) + ';return ';

      content.find(
        '[if], [\\#for], [styleClass],:attrStartsWith("$"), :attrStartsWith("css."), :attrStartsWith("attr."), :attrStartsWith("prop."), :attrStartsWith("class."), :attrStartsWith("event.")'
      ).each(function (e) {
        var $this = $(this);

        (function () {
          var ctx = {
              el: $this,
              attrs: []
            },
            varName,
            indexName = 'index';

          handler.els.push(ctx);

          for (var i = -1, atts = this.attributes, n = atts.length; ++i < n;) {
            var attr = atts[i];

            if (attr.nodeName === '#for') {
              var _for = attr.nodeValue.split('=>');
              if (_for.length < 2) throw new Error('For syntax error: samples => sample');

              var ref = _for[0].trim();
              varName = _for[1].split(':');

              if (varName.length > 1) {
                indexName = varName[1].trim();
              }

              varName = varName[0].trim();

              ctx.ref = ref;
              ctx.indexName = indexName;
              ctx.varName = varName;
              ctx.clones = [];
            } else if (attr.nodeName === 'if' || attr.nodeName === 'styleClass') {
              ctx.attrs.push({
                name: attr.nodeName,
                value: attr.nodeValue,
                action: new Function('$_el', indexName, varName, action + attr.nodeValue)
              });
            } else if (attr.nodeName.indexOf('$') === 0) {
              ctx.attrs.push({
                isMethod: true,
                action: new Function(
                  '$_el',
                  indexName,
                  varName,
                  action + '$_el.' + attr.nodeName.substring(1) + '(' + attr.nodeValue + ')'
                )
              });
            } else if (attr.nodeName.indexOf('.') != -1) {
              var dataAttr = attr.nodeName.split('.'),
                type = dataAttr[0];

              if (type === 'event') {
                var fnc = new Function('$event', action + attr.nodeValue);
                $this.on(attr.nodeName.substring(6), function (e) {
                  fnc.call(c, e);
                });
              } else {
                ctx.attrs.push({
                  type: dataAttr[0],
                  name: dataAttr[1],
                  value: attr.nodeValue,
                  action: new Function('$_el', indexName, varName, action + attr.nodeValue)
                });
              }
            }
          }
        }.call(this));
      });

      if (onLoad) {
        onLoad(c);
        if (c.onLoad) c.onLoad();
      }

      setTimeout(function () {
        checkModifications(handler);

        content.show();
        isDestroyed = null;
        try {
          delete handler.processing;
        } catch (e) {
          processing['processing'] = undefined;
        }

        if (c.afterLoad) c.afterLoad();
      });

      c.__handler = handler;

      return c;
    };

    this.appendTo = function (target, onLoad) {
      var append = function () {
        componentList.push(handler);
      };

      if (componentData) {
        load(target, null, onLoad);
        append();
      } else {
        $.get(path + '.html', {}, function (h) {
          load(target, h, onLoad);
          append();
        });
      }
    };

    this.isDestroyed = function () {
      return isDestroyed === null ? !content.is(':visible') : isDestroyed;
    };

    this.destroy = function () {
      if (isDestroyed) return;

      isDestroyed = true;
      content.remove();
      content = null;
      try {
        delete handler.component.__handler;
        delete handler.component;
      } catch (e) {
        handler.component.__handler = undefined;
        handler.component = undefined;
      }
    };
  };

  return {
    create: function (path) {
      return new ComponentHandler(path);
    },
    checkModification: function (c) {
      checkModifications(c.__handler);
    },
    getHandler: function (c) {
      return c.__handler;
    }
  };
})();

jQuery.extend(jQuery.expr[':'], {
  attrStartsWith: function (el, _, b) {
    for (var i = 0, atts = el.attributes, n = atts.length; i < n; i++) {
      if (atts[i].nodeName.toLowerCase().indexOf(b[3].toLowerCase()) === 0) {
        return true;
      }
    }

    return false;
  }
});