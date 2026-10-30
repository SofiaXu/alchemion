import type { Message } from './i18n'
const word = (key: Message) => `<span data-i18n="${key}"></span>`
const button = (id: string, key: Message, type = 'button') =>
  `<button id="${id}" type="${type}" data-i18n="${key}"></button>`
const field = (id: string, key: Message, content: string) =>
  `<label for="${id}">${word(key)}</label>${content}`
const input = (id: string, value: string, type = 'number') =>
  `<input id="${id}" type="${type}" value="${value}" ${type === 'number' ? 'step="any" required' : ''}>`
const check = (id: string, key: Message, checked = false) =>
  `<label class="check"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}>${word(key)}</label>`
const option = (value: string, key: Message) =>
  `<option value="${value}" data-i18n="${key}"></option>`
const panel = (id: Message, content: string) =>
  `<section id="panel-${id}" class="tool-panel" ${id === 'import' ? '' : 'hidden'}>${content}</section>`
export const markup = `
<header class="topbar"><div><strong class="brand">Alchemion</strong><span class="eyebrow" data-i18n="workbench"></span></div>
<div class="history-tools">${button('undo', 'undo')}${button('redo', 'redo')}${button('cancel', 'cancel')}${button('recompute', 'recompute')}${button('clear', 'clear')}</div>
<label class="language">${word('language')}<select id="language-select"><option value="en">English</option><option value="zh">中文</option></select></label></header>
<main class="workspace"><aside class="tools"><nav aria-label="Tools">${(['import', 'display', 'measure', 'edit', 'export'] as const).map((id) => `<button id="tab-${id}" type="button" data-panel="${id}" aria-pressed="${id === 'import'}" data-i18n="${id}"></button>`).join('')}</nav>
${panel(
  'import',
  `<h1 data-i18n="import"></h1><p data-i18n="tagline"></p>
${field('sample-select', 'sample', `<select id="sample-select">${option('molecule', 'moleculeSample')}${option('crystal', 'crystalSample')}</select>`)}${button('load-sample', 'loadSample')}<p class="hint" data-i18n="sampleNote"></p>
<hr>${field('file-input', 'file', '<input id="file-input" type="file" accept=".cif,.mol,.vasp,.poscar,text/plain">')}
${field('import-format', 'format', '<select id="import-format"><option value="cif">CIF</option><option value="mol" selected>MOL</option><option value="poscar">POSCAR</option></select>')}
${field('import-text', 'input', '<textarea id="import-text" rows="9" spellcheck="false"></textarea>')}
<div id="block-field" hidden>${field('block-select', 'block', '<select id="block-select"></select>')}</div><p>${word('version')}: <output id="import-version">—</output></p>${button('import-button', 'importText')}<p class="hint" data-i18n="importHelp"></p>`
)}
${panel(
  'display',
  `<h1 data-i18n="display"></h1><form id="display-form">
${field('render-mode', 'renderMode', `<select id="render-mode">${option('space-filling', 'spaceFilling')}${option('ball-and-stick', 'ballStick')}</select>`)}
<div class="grid2">${field('atom-scale', 'atomScale', input('atom-scale', '1'))}${field('ball-radius', 'ballRadius', input('ball-radius', '0.45'))}${field('bond-radius', 'bondRadius', input('bond-radius', '0.12'))}${field('missing-radius', 'missingRadius', input('missing-radius', '1.5'))}</div>
${check('show-lattice', 'lattice')}${check('show-symmetry', 'symmetry', true)}${check('show-reciprocal', 'reciprocal')}${check('show-bz', 'bz')}${check('infer-bonds', 'infer', true)}${check('show-performance', 'performance')}
${field('neighbor-cells', 'neighbors', '<textarea id="neighbor-cells" rows="2" spellcheck="false"></textarea>')}<p class="hint" data-i18n="neighborHelp"></p>
${field('cutoff', 'cutoff', `<select id="cutoff">${option('none', 'none')}${option('fraction', 'fraction')}${option('bond', 'bond')}</select>`)}${field('fraction-margin', 'margin', input('fraction-margin', '0 0 0', 'text'))}${button('apply-display', 'applyDisplay', 'submit')}</form>
<hr><h2 data-i18n="style"></h2><form id="style-form">${field('style-element', 'element', '<select id="style-element"></select>')}${field('element-color', 'color', input('element-color', '#3c879e', 'color'))}${field('style-space-radius', 'vdwRadius', input('style-space-radius', '1.7'))}${field('style-ball-radius', 'ballRadius', input('style-ball-radius', '0.45'))}${button('apply-style', 'applyStyle', 'submit')}${button('reset-style', 'resetStyle')}</form>
<hr><div class="button-row">${button('center', 'center')}${button('rotate', 'rotate')}${button('zoom-in', 'zoomIn')}${button('zoom-out', 'zoomOut')}</div>`
)}
${panel('measure', `<h1 data-i18n="measure"></h1><form id="tool-form">${field('interaction-mode', 'interaction', `<select id="interaction-mode">${option('select', 'select')}${option('pick-point', 'point')}${option('measure-distance', 'distance')}${option('measure-angle', 'angle')}${option('measure-torsion', 'torsion')}${option('none', 'none')}</select>`)}${button('apply-tool', 'applyTool', 'submit')}</form><p data-i18n="measureHelp"></p>`)}
${panel(
  'edit',
  `<h1 data-i18n="edit"></h1><p class="hint" data-i18n="editHelp"></p><h2 data-i18n="atomEditor"></h2><form id="atom-form">${field('atom-id', 'atomId', input('atom-id', '', 'text'))}${field('atom-element', 'element', '<select id="atom-element"></select>')}${field('coordinate-frame', 'coordinateFrame', `<select id="coordinate-frame">${option('cartesian', 'cartesian')}${option('fractional', 'fractional')}</select>`)}${field('atom-position', 'position', input('atom-position', '0 0 0', 'text'))}<div class="button-row">${button('apply-atom', 'applyAtom', 'submit')}${button('add-atom', 'addAtom')}${button('delete-atom', 'deleteAtom')}</div></form>
${field('instance-position', 'instancePosition', input('instance-position', '0 0 0', 'text'))}${button('move-instance', 'moveInstance')}
<hr><h2 data-i18n="cellEditor"></h2><p class="hint" data-i18n="cellHelp"></p><form id="cell-form"><fieldset id="cell-fields"><div class="grid2">${['a', 'b', 'c', 'alpha', 'beta', 'gamma'].map((id) => `<label for="cell-${id}">${id}${['a', 'b', 'c'].includes(id) ? ' (Å)' : ' (°)'}</label>${input(`cell-${id}`, ['a', 'b', 'c'].includes(id) ? '8' : '90')}`).join('')}</div>${check('reset-p1', 'resetP1')}${button('apply-cell', 'applyCell', 'submit')}</fieldset></form><p id="cell-unavailable" class="hint" data-i18n="cellOnly"></p>
<hr><h2 data-i18n="sourceAtoms"></h2><div class="table-scroll"><table><thead><tr><th>ID</th><th data-i18n="element"></th><th>x / y / z</th></tr></thead><tbody id="atom-rows"></tbody></table></div><div class="button-row">${button('atoms-previous', 'previous')}<output id="atom-page"></output>${button('atoms-next', 'next')}</div>`
)}
${panel(
  'export',
  `<h1 data-i18n="export"></h1><p class="hint" data-i18n="exportHelp"></p><form id="export-form">${field('export-format', 'format', '<select id="export-format"><option value="mol">MOL</option><option value="cif">CIF</option><option value="poscar">POSCAR</option></select>')}${field('export-version', 'exportVersion', '<select id="export-version"><option value="V3000">V3000</option><option value="V2000">V2000</option></select>')}
<div id="finite-fields">${field('finite-kind', 'finite', `<select id="finite-kind">${option('none', 'finiteNone')}${option('source', 'finiteSource')}${option('instances', 'finiteInstances')}</select>`)}${field('finite-source-ids', 'sourceIds', '<textarea id="finite-source-ids" rows="2"></textarea>')}${button('finite-all', 'useAll')}${button('collect-instance', 'collectInstance')}${button('clear-instances', 'clearInstances')}<p>${word('count')}: <output id="instance-count">0</output></p></div>${button('preview-export', 'preview', 'submit')}${button('accept-loss', 'acceptLoss')}</form><div class="button-row">${button('download-export', 'download')}${button('reimport-export', 'reimport')}</div>${field('export-output', 'output', '<textarea id="export-output" rows="9" readonly spellcheck="false"></textarea>')}<details><summary data-i18n="mapping"></summary><pre id="export-mapping"></pre></details>`
)}
</aside><section class="stage"><div class="document-bar"><output id="demo-status" role="status" aria-live="polite"></output><output id="document-summary"></output></div><div id="viewer" class="viewer"></div><div id="webgl-unavailable" role="alert" hidden><p data-i18n="unavailable"></p><pre id="webgl-details"></pre></div><p id="operation-note" role="status" class="operation-note"></p></section>
<aside class="inspector"><h2 data-i18n="inspection"></h2><h3 data-i18n="selection"></h3><pre id="selection-details"></pre><h3 data-i18n="pointResult"></h3><pre id="point-details"></pre><h3 data-i18n="measurement"></h3><output id="measurement-result"></output><pre id="measurement-details"></pre><hr><h2 data-i18n="diagnostics"></h2>${(['import', 'runtime', 'export'] as const).map((id) => `<details open><summary data-i18n="${id}Diagnostics"></summary><pre id="${id}-diagnostics" class="diagnostics"></pre></details>`).join('')}<a id="sources-link" href="./generated/notices.txt" target="_blank" rel="noopener" data-i18n="sources"></a></aside></main>`
