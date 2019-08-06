<script>
  let classDef = ''
  let classAttrs = []
  let classMethods = []
  let output = ''
  let className = ''
  let objName = ''
  let example = ''
  let buttonText = 'Fill it for me'

  function colorWrap(text, codeType) {
    return '<span class="code-' + codeType + '">' + text + '</span>'
  }

  let singleQ = colorWrap("'", 'grammar')
  let doubleQ = colorWrap('"', 'grammar')
  let ps2 = colorWrap('> ', 'prompt')

  function getSetCode(objName, arg, value) {
    function getterGen( v, indentLvl ) {
      let indent = ' '.repeat(indentLvl)
      return colorWrap(objName + '_' + arg + '() {', 'assign') + '\n  ' +
        indent + colorWrap('printf', 'builtin') + ' %s ' +
        colorWrap(v, 'string') + '\n' + indent + colorWrap('}', 'assign')
    }
    let getter = getterGen(singleQ + value + singleQ, 0)
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
      singleQ + '\n' + colorWrap('}', 'assign')
    return getter + '\n\n' + setter
  }

  function methodCode(className, objName, methodName, attrs) {
    let attrDefs = '  ' +
      colorWrap('# Populate all object attributes for the actual function call',
        'comment') + '\n  ' + colorWrap('local', 'builtin') + ' ' +
      colorWrap('self', 'assign') + '=' + objName + '\n'
    attrs.forEach(attr => {
      attrDefs += '  ' + colorWrap('local', 'builtin') + ' ' +
        colorWrap(attr.name, 'assign') +
        '=' + colorWrap('$(', 'var') + objName + '_' + attr.name +
        colorWrap(')', 'var') + '\n'
    })
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
      classDef = ''
      return
    }

    classDef = 'Car speed brand _start'
    className = 'Car'
    objName = 'truck'
    classAttrs= [
      {name: 'speed', value: '150'},
      {name: 'brand', value: 'Toyota'},
    ]
  }

  $: {
    if (classDef) {
      buttonText = 'Clear it for me'
    } else {
      buttonText = 'Fill it for me'
      objName = ''
    }
    let splittedClass = classDef.trim().split(" ")
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
      cmd: '. ./clash' + colorWrap(' # source the clash library', 'comment'),
      output: '',
    },
    {
      cmd: 'class ' + classDef +
        colorWrap(' # Create the ' + className + ' class', 'comment'),
      output: ''
    })
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
      })
    }
    if (objName) {
      exampleLines.push({
        cmd: className + ' ' + objName +
          classAttrs.reduce( (acc, val) => acc + ' ' + val.value, '') +
          colorWrap(' # Create a new instance of ' + className + ' called ' +
            objName, 'comment'),
        output: ''
      })
      if (methods.length) {
        exampleLines.push({
          cmd: objName + methods[0].name +
            colorWrap(' # Call the ' +
              className + methods[0].name + ' with ' + objName +
              ' attributes populated', 'comment'),
          output: 'Calling ' + objName + ' object method\n'
        })
      }
      if (classAttrs.length) {
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
        colorWrap(line.output, 'example-output') + '\n'
    })
    example = example.trim()
  }
</script>

<header>
  <a href='https://github.com/lhoursquentin/clash'>
    Go to clash github repo
  </a>
</header>

<main>
  <button on:click={autofill}>{buttonText}</button>
  <section>
    <form>
     <span class='input-header'>class </span>
     <input id='class-input' bind:value={classDef}/>
    </form>

    <form>
      <span class='input-header'>{className}</span>

     {#if className}
       <input bind:value={objName} placeholder='{className} object name'/>
     {/if}

     {#each classAttrs as attr}
       <input bind:value={attr.value} placeholder={attr.name}/>
     {/each}
    </form>
  </section>

  <div class='flexbox'>
    <section>
      <h3>Generated code</h3>

      {#each classAttrs as classAttr}
        <pre><code>{@html classAttr.content}</code></pre>
      {/each}

      {#each classMethods as classMethod}
        <pre><code>{@html classMethod.content}</code></pre>
      {/each}
    </section>
    <section>
      <h3>Example</h3>
      <pre><code>{@html example}</code></pre>
    </section>
    <section id='notes'>
      <h3>Notes</h3>
      <ul>
        <li>
          The actual generated code is much longer, it has been simplified to
          be readable and to show the basic concept of clash
        </li>
        <li>
          This demo does not run a shell, it's all front-end JavaScript (using
          <a href='https://svelte.dev' target='_blank'>Svelte</a>) simulating
          how clash works
        </li>
      </ul>
    </section>
  </div>
</main>
