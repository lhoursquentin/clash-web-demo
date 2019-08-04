<script>
  let classDef = ''
  let classAttrs = []
  let classMethods = []
  let output = ''
  let className = ''
  let objName = ''
  let example = ''

  function colorWrap(text, codeType) {
    return '<span class="code-' + codeType + '">' + text + '</span>'
  }

  let singleQ = colorWrap("'", 'grammar')
  let doubleQ = colorWrap('"', 'grammar')

  function getSetCode(objName, arg, value) {
    function getterGen( v, indentLvl ) {
      let indent = ' '.repeat(indentLvl)
      return colorWrap(objName + '_' + arg + '() {', 'assign') + '\n  ' +
        indent + colorWrap('printf', 'builtin') + ' %s ' +
        colorWrap(v, 'string') + '\n' + indent + colorWrap('}', 'assign')
    }
    let getter = getterGen(singleQ + value + singleQ, 0)
    let setter = colorWrap(objName + '_' + arg + "_is() {\n  ", 'assign') +
      colorWrap('eval', 'builtin') +
      ' ' + singleQ +
      colorWrap(
        getterGen(
          singleQ + doubleQ + colorWrap("'", 'string') +
            colorWrap('$1', 'var') +
            colorWrap("'", 'string') + doubleQ + singleQ,
          2),
        'string'
      ) +
      singleQ + '\n' + colorWrap('}', 'assign')
    return getter + '\n' + setter
  }

  function methodCode(className, objName, methodName, attrs) {
    let attrDefs = '  ' + colorWrap('local', 'builtin') +
      ' ' + colorWrap('self', 'assign') + '=' + objName + '\n'
    attrs.forEach(attr => {
      attrDefs += '  ' + colorWrap('local', 'builtin') + ' ' +
        colorWrap(attr.name, 'assign') +
        '=' + colorWrap('$(', 'var') + objName + '_' + attr.name +
        colorWrap(')', 'var') + '\n'
    })
    return colorWrap(objName + methodName + '() {', 'assign') +
      ' \n' + attrDefs + '  ' + className +
      methodName + ' ' + doubleQ + colorWrap('$@', 'var') + doubleQ + '\n' +
      colorWrap('}', 'assign')
  }

  $: {
    let splittedClass = classDef.split(" ")
    className = splittedClass[0]
    let attrs = []
    let methods = []
    splittedClass.slice(1).forEach((arg, i) => {
      if (arg.startsWith('_')) {
        methods.push({
          name: arg,
          content: ''
        })
      } else {
        let value = (classAttrs[i] ? classAttrs[i].value : '')
        attrs.push({
          name: arg,
          value: value,
          content: getSetCode(objName, arg, value)
        })
      }
    })
    methods.forEach(arg => {
      arg.content = methodCode(className, objName, arg.name, attrs)
    })
    classAttrs = attrs
    classMethods = methods
    let exampleLines = []
    example = ''
    exampleLines.push({
      cmd: 'class ' + classDef,
      output: ''
    })
    if (objName) {
      exampleLines.push({
        cmd: className + ' ' + objName + classAttrs.reduce( (acc, val) => acc + ' ' + val.value, ''),
        output: ''
      })
      if (classAttrs.length > 0) {
        let attr = classAttrs[0]
        exampleLines.push({
          cmd: (colorWrap('printf', 'builtin') + ' ' + singleQ +
            colorWrap(objName + ' ' + attr.name + ' value is: ', 'string') +
            singleQ + colorWrap(';', 'grammar') + ' ' + objName + '_' +
            attr.name),
          output: objName + ' ' + attr.name + ' value is: ' + attr.value + '\n'
        })
      }
    }
    let shPrompt = colorWrap('sh$', 'prompt')
    exampleLines.forEach( line => {
      example += shPrompt + ' ' + line.cmd + '\n' +
        colorWrap(line.output, 'example-output')
    })
  }
</script>

<form>
 <span>class </span>
 <input bind:value={classDef}/>
</form>

<form>
 {className}

 {#if className}
   <input bind:value={objName} placeholder='{className} object name'/>
 {/if}

 {#each classAttrs as attr}
   <input bind:value={attr.value} placeholder={attr.name}/>
 {/each}
</form>

<div>
  <h3>Generated code</h3>

  {#each classAttrs as classAttr}
    <pre><code>{@html classAttr.content}</code></pre>
  {/each}

  {#each classMethods as classMethod}
    <pre><code>{@html classMethod.content}</code></pre>
  {/each}
</div>
<div style='padding-bottom: 20px'>
  <h3>Example</h3>
  <pre><code>{@html example}</code></pre>
</div>
