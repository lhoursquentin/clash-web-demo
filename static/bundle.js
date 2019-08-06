var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal: not_equal$$1,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/App.svelte generated by Svelte v3.6.4 */

    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.classMethod = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.classAttr = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.attr = list[i];
    	child_ctx.each_value_2 = list;
    	child_ctx.attr_index = i;
    	return child_ctx;
    }

    // (189:5) {#if className}
    function create_if_block(ctx) {
    	var input, input_placeholder_value, dispose;

    	return {
    		c: function create() {
    			input = element("input");
    			attr(input, "placeholder", input_placeholder_value = "" + ctx.className + " object name");
    			add_location(input, file, 189, 7, 5904);
    			dispose = listen(input, "input", ctx.input_input_handler_1);
    		},

    		m: function mount(target, anchor) {
    			insert(target, input, anchor);

    			input.value = ctx.objName;
    		},

    		p: function update(changed, ctx) {
    			if (changed.objName && (input.value !== ctx.objName)) input.value = ctx.objName;

    			if ((changed.className) && input_placeholder_value !== (input_placeholder_value = "" + ctx.className + " object name")) {
    				attr(input, "placeholder", input_placeholder_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(input);
    			}

    			dispose();
    		}
    	};
    }

    // (193:5) {#each classAttrs as attr}
    function create_each_block_2(ctx) {
    	var input, input_placeholder_value, dispose;

    	function input_input_handler_2() {
    		ctx.input_input_handler_2.call(input, ctx);
    	}

    	return {
    		c: function create() {
    			input = element("input");
    			attr(input, "placeholder", input_placeholder_value = ctx.attr.name);
    			add_location(input, file, 193, 7, 6023);
    			dispose = listen(input, "input", input_input_handler_2);
    		},

    		m: function mount(target, anchor) {
    			insert(target, input, anchor);

    			input.value = ctx.attr.value;
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if (changed.classAttrs && (input.value !== ctx.attr.value)) input.value = ctx.attr.value;

    			if ((changed.classAttrs) && input_placeholder_value !== (input_placeholder_value = ctx.attr.name)) {
    				attr(input, "placeholder", input_placeholder_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(input);
    			}

    			dispose();
    		}
    	};
    }

    // (203:6) {#each classAttrs as classAttr}
    function create_each_block_1(ctx) {
    	var pre, code, raw_value = ctx.classAttr.content;

    	return {
    		c: function create() {
    			pre = element("pre");
    			code = element("code");
    			add_location(code, file, 203, 13, 6239);
    			add_location(pre, file, 203, 8, 6234);
    		},

    		m: function mount(target, anchor) {
    			insert(target, pre, anchor);
    			append(pre, code);
    			code.innerHTML = raw_value;
    		},

    		p: function update(changed, ctx) {
    			if ((changed.classAttrs) && raw_value !== (raw_value = ctx.classAttr.content)) {
    				code.innerHTML = raw_value;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(pre);
    			}
    		}
    	};
    }

    // (207:6) {#each classMethods as classMethod}
    function create_each_block(ctx) {
    	var pre, code, raw_value = ctx.classMethod.content;

    	return {
    		c: function create() {
    			pre = element("pre");
    			code = element("code");
    			add_location(code, file, 207, 13, 6354);
    			add_location(pre, file, 207, 8, 6349);
    		},

    		m: function mount(target, anchor) {
    			insert(target, pre, anchor);
    			append(pre, code);
    			code.innerHTML = raw_value;
    		},

    		p: function update(changed, ctx) {
    			if ((changed.classMethods) && raw_value !== (raw_value = ctx.classMethod.content)) {
    				code.innerHTML = raw_value;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(pre);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var header, a0, t1, main, button, t2, t3, section0, form0, span0, t5, input, t6, form1, span1, t7, t8, t9, t10, div, section1, h30, t12, t13, t14, section2, h31, t16, pre, code, t17, section3, h32, t19, ul, li0, t21, li1, t22, a1, t24, t25, li2, t26, a2, dispose;

    	var if_block = (ctx.className) && create_if_block(ctx);

    	var each_value_2 = ctx.classAttrs;

    	var each_blocks_2 = [];

    	for (var i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	var each_value_1 = ctx.classAttrs;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	var each_value = ctx.classMethods;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			header = element("header");
    			a0 = element("a");
    			a0.textContent = "Go to clash github repo";
    			t1 = space();
    			main = element("main");
    			button = element("button");
    			t2 = text(ctx.buttonText);
    			t3 = space();
    			section0 = element("section");
    			form0 = element("form");
    			span0 = element("span");
    			span0.textContent = "class";
    			t5 = space();
    			input = element("input");
    			t6 = space();
    			form1 = element("form");
    			span1 = element("span");
    			t7 = text(ctx.className);
    			t8 = space();
    			if (if_block) if_block.c();
    			t9 = space();

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t10 = space();
    			div = element("div");
    			section1 = element("section");
    			h30 = element("h3");
    			h30.textContent = "Generated code";
    			t12 = space();

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t13 = space();

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t14 = space();
    			section2 = element("section");
    			h31 = element("h3");
    			h31.textContent = "Example";
    			t16 = space();
    			pre = element("pre");
    			code = element("code");
    			t17 = space();
    			section3 = element("section");
    			h32 = element("h3");
    			h32.textContent = "Notes";
    			t19 = space();
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "The actual generated code is much longer, it has been simplified to\n          be readable and to show the basic concept of clash";
    			t21 = space();
    			li1 = element("li");
    			t22 = text("This demo does not run a shell, it's all front-end JavaScript (using\n          ");
    			a1 = element("a");
    			a1.textContent = "Svelte";
    			t24 = text(") simulating\n          how clash works");
    			t25 = space();
    			li2 = element("li");
    			t26 = text("Source code of this web app available\n          ");
    			a2 = element("a");
    			a2.textContent = "here";
    			attr(a0, "href", "https://github.com/lhoursquentin/clash");
    			add_location(a0, file, 172, 2, 5522);
    			add_location(header, file, 171, 0, 5511);
    			add_location(button, file, 178, 2, 5627);
    			attr(span0, "class", "input-header");
    			add_location(span0, file, 181, 5, 5705);
    			attr(input, "id", "class-input");
    			add_location(input, file, 182, 5, 5751);
    			add_location(form0, file, 180, 4, 5693);
    			attr(span1, "class", "input-header");
    			add_location(span1, file, 186, 6, 5829);
    			add_location(form1, file, 185, 4, 5816);
    			add_location(section0, file, 179, 2, 5679);
    			add_location(h30, file, 200, 6, 6163);
    			add_location(section1, file, 199, 4, 6147);
    			add_location(h31, file, 211, 6, 6450);
    			add_location(code, file, 212, 11, 6478);
    			add_location(pre, file, 212, 6, 6473);
    			add_location(section2, file, 210, 4, 6434);
    			add_location(h32, file, 215, 6, 6559);
    			add_location(li0, file, 217, 8, 6593);
    			attr(a1, "href", "https://svelte.dev");
    			attr(a1, "target", "_blank");
    			add_location(a1, file, 223, 10, 6853);
    			add_location(li1, file, 221, 8, 6759);
    			attr(a2, "href", "https://github.com/lhoursquentin/clash-web-demo");
    			attr(a2, "target", "_blank");
    			add_location(a2, file, 228, 10, 7032);
    			add_location(li2, file, 226, 8, 6969);
    			add_location(ul, file, 216, 6, 6580);
    			attr(section3, "id", "notes");
    			add_location(section3, file, 214, 4, 6532);
    			attr(div, "class", "flexbox");
    			add_location(div, file, 198, 2, 6121);
    			add_location(main, file, 177, 0, 5618);

    			dispose = [
    				listen(button, "click", ctx.autofill),
    				listen(input, "input", ctx.input_input_handler)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, header, anchor);
    			append(header, a0);
    			insert(target, t1, anchor);
    			insert(target, main, anchor);
    			append(main, button);
    			append(button, t2);
    			append(main, t3);
    			append(main, section0);
    			append(section0, form0);
    			append(form0, span0);
    			append(form0, t5);
    			append(form0, input);

    			input.value = ctx.classDef;

    			append(section0, t6);
    			append(section0, form1);
    			append(form1, span1);
    			append(span1, t7);
    			append(form1, t8);
    			if (if_block) if_block.m(form1, null);
    			append(form1, t9);

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(form1, null);
    			}

    			append(main, t10);
    			append(main, div);
    			append(div, section1);
    			append(section1, h30);
    			append(section1, t12);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(section1, null);
    			}

    			append(section1, t13);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(section1, null);
    			}

    			append(div, t14);
    			append(div, section2);
    			append(section2, h31);
    			append(section2, t16);
    			append(section2, pre);
    			append(pre, code);
    			code.innerHTML = ctx.example;
    			append(div, t17);
    			append(div, section3);
    			append(section3, h32);
    			append(section3, t19);
    			append(section3, ul);
    			append(ul, li0);
    			append(ul, t21);
    			append(ul, li1);
    			append(li1, t22);
    			append(li1, a1);
    			append(li1, t24);
    			append(ul, t25);
    			append(ul, li2);
    			append(li2, t26);
    			append(li2, a2);
    		},

    		p: function update(changed, ctx) {
    			if (changed.buttonText) {
    				set_data(t2, ctx.buttonText);
    			}

    			if (changed.classDef && (input.value !== ctx.classDef)) input.value = ctx.classDef;

    			if (changed.className) {
    				set_data(t7, ctx.className);
    			}

    			if (ctx.className) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(form1, t9);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (changed.classAttrs) {
    				each_value_2 = ctx.classAttrs;

    				for (var i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(form1, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}
    				each_blocks_2.length = each_value_2.length;
    			}

    			if (changed.classAttrs) {
    				each_value_1 = ctx.classAttrs;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(section1, t13);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (changed.classMethods) {
    				each_value = ctx.classMethods;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(section1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if (changed.example) {
    				code.innerHTML = ctx.example;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(header);
    				detach(t1);
    				detach(main);
    			}

    			if (if_block) if_block.d();

    			destroy_each(each_blocks_2, detaching);

    			destroy_each(each_blocks_1, detaching);

    			destroy_each(each_blocks, detaching);

    			run_all(dispose);
    		}
    	};
    }

    function colorWrap(text, codeType) {
      return '<span class="code-' + codeType + '">' + text + '</span>'
    }

    function instance($$self, $$props, $$invalidate) {
    	let classDef = '';
      let classAttrs = [];
      let classMethods = [];
      let className = '';
      let objName = '';
      let example = '';
      let buttonText = 'Fill it for me';

      let singleQ = colorWrap("'", 'grammar');
      let doubleQ = colorWrap('"', 'grammar');
      let ps2 = colorWrap('> ', 'prompt');

      function getSetCode(objName, arg, value) {
        function getterGen( v, indentLvl ) {
          let indent = ' '.repeat(indentLvl);
          return colorWrap(objName + '_' + arg + '() {', 'assign') + '\n  ' +
            indent + colorWrap('printf', 'builtin') + ' %s ' +
            colorWrap(v, 'string') + '\n' + indent + colorWrap('}', 'assign')
        }
        let getter = getterGen(singleQ + value + singleQ, 0);
        let setter = colorWrap(objName + '_' + arg + '_is() {', 'assign') + '\n  ' +
          colorWrap('# Recreate the ' + objName + '_' + arg +
            ' getter above with a new value', 'comment') +
          '\n  ' + colorWrap('eval', 'builtin') +
          ' ' + singleQ +
          colorWrap(
            getterGen(
              singleQ + doubleQ + colorWrap("'", 'string') +
                colorWrap('$1', 'var') +
                colorWrap("'", 'string') + doubleQ + singleQ,
              2),
            'string'
          ) +
          singleQ + '\n' + colorWrap('}', 'assign');
        return getter + '\n\n' + setter
      }

      function methodCode(className, objName, methodName, attrs) {
        let attrDefs = '  ' +
          colorWrap('# Populate all object attributes for the actual function call',
            'comment') + '\n  ' + colorWrap('local', 'builtin') + ' ' +
          colorWrap('self', 'assign') + '=' + objName + '\n';
        attrs.forEach(attr => {
          attrDefs += '  ' + colorWrap('local', 'builtin') + ' ' +
            colorWrap(attr.name, 'assign') +
            '=' + colorWrap('$(', 'var') + objName + '_' + attr.name +
            colorWrap(')', 'var') + '\n';
        });
        return colorWrap(objName + methodName + '() {', 'assign') +
          ' \n' + attrDefs + '  ' + className +
          methodName + ' ' + doubleQ + colorWrap('$@', 'var') + doubleQ +
          colorWrap(
            ' # ' + className + methodName +
              ' function must be created by the user',
            'comment'
          ) +
          '\n' + colorWrap('}', 'assign')
      }

      function autofill() {
        if (classDef) {
          $$invalidate('classDef', classDef = '');
          return
        }

        $$invalidate('classDef', classDef = 'Car speed brand _start');
        $$invalidate('className', className = 'Car');
        $$invalidate('objName', objName = 'truck');
        $$invalidate('classAttrs', classAttrs= [
          {name: 'speed', value: '150'},
          {name: 'brand', value: 'Toyota'},
        ]);
      }

    	function input_input_handler() {
    		classDef = this.value;
    		$$invalidate('classDef', classDef);
    	}

    	function input_input_handler_1() {
    		objName = this.value;
    		$$invalidate('objName', objName), $$invalidate('classDef', classDef), $$invalidate('classAttrs', classAttrs), $$invalidate('className', className), $$invalidate('ps2', ps2), $$invalidate('doubleQ', doubleQ), $$invalidate('singleQ', singleQ), $$invalidate('example', example);
    	}

    	function input_input_handler_2({ attr, each_value_2, attr_index }) {
    		each_value_2[attr_index].value = this.value;
    		$$invalidate('classAttrs', classAttrs), $$invalidate('classDef', classDef), $$invalidate('objName', objName), $$invalidate('className', className), $$invalidate('ps2', ps2), $$invalidate('doubleQ', doubleQ), $$invalidate('singleQ', singleQ), $$invalidate('example', example);
    	}

    	$$self.$$.update = ($$dirty = { classDef: 1, classAttrs: 1, objName: 1, className: 1, ps2: 1, doubleQ: 1, singleQ: 1, example: 1 }) => {
    		if ($$dirty.classDef || $$dirty.classAttrs || $$dirty.objName || $$dirty.className || $$dirty.ps2 || $$dirty.doubleQ || $$dirty.singleQ || $$dirty.example) { {
            if (classDef) {
              $$invalidate('buttonText', buttonText = 'Clear it for me');
            } else {
              $$invalidate('buttonText', buttonText = 'Fill it for me');
              $$invalidate('objName', objName = '');
            }
            let splittedClass = classDef.trim().split(" ");
            $$invalidate('className', className = splittedClass[0]);
            let attrs = [];
            let methods = [];
            splittedClass.slice(1).forEach((arg, i) => {
              if (arg.startsWith('_')) {
                methods.push({
                  name: arg,
                  content: ''
                });
              } else {
                let value = (classAttrs[i] ? classAttrs[i].value : '');
                attrs.push({
                  name: arg,
                  value: value,
                  content: getSetCode(objName, arg, value)
                });
              }
            });
            methods.forEach(arg => {
              arg.content = methodCode(className, objName, arg.name, attrs);
            });
            $$invalidate('classAttrs', classAttrs = attrs);
            $$invalidate('classMethods', classMethods = methods);
            let exampleLines = [];
            $$invalidate('example', example = '');
            exampleLines.push({
              cmd: '. ./clash' + colorWrap(' # source the clash library', 'comment'),
              output: '',
            },
            {
              cmd: 'class ' + classDef +
                colorWrap(' # Create the ' + className + ' class', 'comment'),
              output: ''
            });
            if (methods.length) {
              exampleLines.push({
                cmd: colorWrap(className + methods[0].name + '() {', 'assign') + 
                  colorWrap(' # Implement the ' + methods[0].name.substring(1) +
                    ' method', 'comment') + '\n' +
                  ps2 + '    ' +  colorWrap('echo', 'builtin') + ' ' + doubleQ +
                  colorWrap('Calling ', 'string') + colorWrap('$self', 'var') +
                  colorWrap(' object method', 'string') + doubleQ + '\n' +
                  ps2 + '  ' + colorWrap('}', 'assign'),
                output: ''
              });
            }
            if (objName) {
              exampleLines.push({
                cmd: className + ' ' + objName +
                  classAttrs.reduce( (acc, val) => acc + ' ' + val.value, '') +
                  colorWrap(' # Create a new instance of ' + className + ' called ' +
                    objName, 'comment'),
                output: ''
              });
              if (methods.length) {
                exampleLines.push({
                  cmd: objName + methods[0].name +
                    colorWrap(' # Call ' +
                      className + methods[0].name + ' with ' + objName +
                      ' attributes populated', 'comment'),
                  output: 'Calling ' + objName + ' object method\n'
                });
              }
              if (classAttrs.length) {
                let attr = classAttrs[0];
                exampleLines.push({
                  cmd: (colorWrap('printf', 'builtin') + ' ' + singleQ +
                    colorWrap(objName + ' ' + attr.name + ' value is: ', 'string') +
                    singleQ + colorWrap(';', 'grammar') + ' ' + objName + '_' +
                    attr.name),
                  output: objName + ' ' + attr.name + ' value is: ' + attr.value + '\n'
                });
              }
            }
            let shPrompt = colorWrap('sh$', 'prompt');
            exampleLines.forEach( line => {
              $$invalidate('example', example += shPrompt + ' ' + line.cmd + '\n' +
                colorWrap(line.output, 'example-output') + '\n');
            });
            $$invalidate('example', example = example.trim());
          } }
    	};

    	return {
    		classDef,
    		classAttrs,
    		classMethods,
    		className,
    		objName,
    		example,
    		buttonText,
    		autofill,
    		input_input_handler,
    		input_input_handler_1,
    		input_input_handler_2
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, []);
    	}
    }

    var app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
