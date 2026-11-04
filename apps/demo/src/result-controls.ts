import type { Message } from './i18n'

export const resultFormats = {
  chgcar: 'CHGCAR',
  chg: 'CHG',
  locpot: 'LOCPOT',
  cube: 'Cube',
  contcar: 'CONTCAR',
  xdatcar: 'XDATCAR',
  vasprun: 'vasprun.xml',
  outcar: 'OUTCAR',
  'alchemion-result': 'Alchemion JSON'
} as const

export const resultKinds = {
  surface: 'resultSurface',
  slice: 'resultSlice',
  atomic: 'resultAtomic',
  comparison: 'resultComparison',
  vibration: 'resultVibration',
  fermi: 'resultFermi'
} as const satisfies Record<string, Message>

const word = (key: Message) => `<span data-i18n="${key}"></span>`
const button = (id: string, key: Message, type = 'button') =>
  `<button id="${id}" type="${type}" data-i18n="${key}"></button>`
const field = (id: string, key: Message, content: string) =>
  `<label for="${id}">${word(key)}</label>${content}`
const input = (id: string, value = '', type = 'number') =>
  `<input id="${id}" type="${type}" value="${value}"${type === 'number' ? ' step="any"' : ''}>`
const select = (id: string, content = '') => `<select id="${id}">${content}</select>`
const check = (id: string, key: Message, checked = false) =>
  `<label class="check"><input id="${id}" type="checkbox"${checked ? ' checked' : ''}>${word(key)}</label>`
const number = (id: string, key: Message, value = '') => field(id, key, input(id, value))
const text = (id: string, key: Message, value = '') => field(id, key, input(id, value, 'text'))
const choice = (id: string, key: Message, content = '') => field(id, key, select(id, content))

export function appendResultTools() {
  document
    .querySelector('.tools nav')!
    .insertAdjacentHTML(
      'beforeend',
      '<button id="tab-results" type="button" data-panel="results" aria-pressed="false" data-i18n="results"></button>'
    )
  document.querySelector('.tools')!.insertAdjacentHTML(
    'beforeend',
    `<section id="panel-results" class="tool-panel" hidden>
    <h1 data-i18n="results"></h1><p class="hint" data-i18n="resultHelp"></p>
    <form id="result-import-form">
      ${choice(
        'result-format',
        'format',
        Object.entries(resultFormats)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join('')
      )}
      ${field('result-file', 'resultFile', '<input id="result-file" type="file">')}
      <div id="result-cube-fields" hidden>${text('result-quantity', 'resultQuantity')}${text('result-unit', 'resultUnit')}<p class="hint" data-i18n="resultCubeHelp"></p></div>
      <details id="result-path-fields" hidden><summary data-i18n="resultPath"></summary>
        ${field('result-path', 'resultPath', '<textarea id="result-path" rows="3" spellcheck="false"></textarea>')}
        <p class="hint" data-i18n="resultPathHelp"></p>
      </details>
      ${button('result-import', 'resultImport', 'submit')}
    </form>
    <output id="result-import-status" aria-live="polite"></output>
    <pre id="result-import-diagnostics" class="diagnostics" hidden></pre>
    <details><summary data-i18n="resultNeb"></summary>
      <form id="result-neb-form">
        ${field('result-neb-files', 'resultNebFiles', '<input id="result-neb-files" type="file" multiple>')}
        ${field('result-neb-rows', 'resultNebRows', '<textarea id="result-neb-rows" rows="3" spellcheck="false"></textarea>')}
        <p class="hint" data-i18n="resultNebHelp"></p>
        ${button('result-neb', 'resultNeb', 'submit')}
      </form>
    </details>
    <hr>
    ${choice('result-choice', 'resultChoose')}
    <output id="result-binding-status" aria-live="polite"></output>
    <pre id="result-run-status"></pre>
    <details id="result-binding-fields">
      <summary data-i18n="resultBind"></summary>
      ${field('result-receipt', 'resultReceipt', '<input id="result-receipt" type="file" accept=".json,application/json">')}
      ${field('result-atom-ids', 'resultMapping', '<textarea id="result-atom-ids" rows="2" spellcheck="false"></textarea>')}
      <p id="result-mapping-preview" class="hint"></p>
      <p class="hint" data-i18n="resultMappingHelp"></p>
      ${button('result-bind', 'resultBind')}
    </details>
    ${choice('result-frame', 'resultFrame')}
    <input id="result-frame-slider" type="range" min="0" max="0" value="0" step="1" aria-labelledby="result-frame">
    <div class="button-row">${button('result-open', 'resultOpen')}${button('result-remove', 'resultRemove')}</div>
    <div id="result-frame-preview">
      ${check('result-continuous', 'resultContinuous')}
      ${number('result-rate', 'resultFramesPerSecond', '5')}
      <div class="button-row">${button('result-preview-frame', 'resultPreviewFrame')}${button('result-exit-preview', 'resultExitPreview')}</div>
      <div class="button-row">${button('result-play', 'resultPlay')}${button('result-pause', 'resultPause')}</div>
    </div>
    <div id="result-charts" hidden>
      <div id="result-energy-reference">${choice('result-energy-basis', 'resultEnergyBasis')}</div>
      <div id="result-chart-plots"></div>
      <div id="result-k-controls">${choice('result-k-index', 'resultKPoint')}${button('result-k-mark', 'resultKPoint')}</div>
    </div>
    <hr><h2 data-i18n="resultLayer"></h2>
    ${choice('result-layer-choice', 'resultLayer')}
    <div class="button-row">${button('result-toggle-layer', 'resultToggleLayer')}${button('result-remove-layer', 'resultRemoveLayer')}${button('result-pick', 'resultPick')}</div>
    <output id="result-layer-status" aria-live="polite"></output>
    <pre id="result-layer-diagnostics" class="diagnostics" hidden></pre>
    <details id="result-layer-settings" open>
      <summary data-i18n="resultLayerSettings"></summary>
      <form id="result-layer-form">
        ${choice(
          'result-layer-kind',
          'resultLayerKind',
          Object.entries(resultKinds)
            .map(([value, key]) => `<option value="${value}" data-i18n="${key}"></option>`)
            .join('')
        )}
        <div id="result-data-fields">${choice('result-data', 'resultData')}</div>
        <p id="result-fermi-notice" class="hint"></p>
        <div id="result-surface-fields">
          ${number('result-threshold', 'resultThreshold', '0.05')}
          ${number('result-negative-threshold', 'resultNegativeThreshold')}
          ${field('result-negative-color', 'resultNegativeColor', input('result-negative-color', '#2266c8', 'color'))}
        </div>
        <div id="result-slice-fields" hidden>
          ${text('result-plane-point', 'resultPlanePoint', '0 0 0')}
          ${text('result-plane-normal', 'resultPlaneNormal', '0 0 1')}
        </div>
        <div id="result-grid-fields">
          ${field('result-tiles', 'resultTiles', '<textarea id="result-tiles" rows="2"></textarea>')}
          ${choice('result-color-data', 'resultColorBy')}
          ${choice('result-subtract-data', 'resultSubtract')}
          ${check('result-resample', 'resultResample')}
        </div>
        <div id="result-atomic-fields" hidden>
          ${text('result-elements', 'resultElements')}
          ${check('result-selected-only', 'resultSelectedOnly')}
          ${check('result-labels', 'resultLabels')}
          ${check('result-arrows', 'resultArrows', true)}
        </div>
        <div id="result-compare-fields" hidden>
          ${choice('result-target', 'resultCompareTarget')}
          ${choice('result-target-frame', 'resultCompareFrame')}
          <div id="result-pair-fields" hidden>
            ${field('result-pairs', 'resultPairs', '<textarea id="result-pairs" rows="3"></textarea>')}
            ${button('result-suggest-pairs', 'resultSuggestPairs')}
            <p id="result-pair-count" class="hint"></p>
            <p class="hint" data-i18n="resultPairHelp"></p>
          </div>
          ${check('result-remove-deformation', 'resultRemoveDeformation')}
          ${check('result-rigid-fit', 'resultRigidFit')}
        </div>
        <div id="result-vibration-fields" hidden>
          ${choice('result-mode', 'resultMode')}
          ${number('result-phase', 'resultPhase', '0')}
          ${text('result-supercell', 'resultSupercell', '1 1 1')}
          <p id="result-mode-notice" class="hint"></p>
          <div class="button-row">${button('result-animate', 'resultAnimate')}${button('result-pause-animation', 'resultPause')}${button('result-stop-animation', 'resultStopAnimation')}</div>
        </div>
        <div id="result-scale-fields" hidden>${number('result-scale', 'resultScale', '1')}</div>
        <div id="result-color-scale" class="grid2">${number('result-min', 'resultMin')}${number('result-max', 'resultMax')}</div>
        <div class="grid2">${number('result-opacity', 'resultOpacity', '0.6')}${number('result-order', 'resultOrder', '0')}</div>
        ${field('result-color', 'color', input('result-color', '#d7662c', 'color'))}
        ${check('result-visible', 'resultVisible', true)}
        <div class="button-row">${button('result-add-layer', 'resultAddLayer', 'submit')}${button('result-apply-layer', 'resultApplyLayer')}</div>
      </form>
    </details>
    </section>`
  )
  document
    .getElementById('download-export')!
    .insertAdjacentHTML('afterend', button('download-poscar-receipt', 'resultDownloadReceipt'))
  document
    .getElementById('interaction-mode')!
    .insertAdjacentHTML('beforeend', '<option value="pick-result" data-i18n="resultPick"></option>')
  document
    .getElementById('point-details')!
    .insertAdjacentHTML(
      'afterend',
      '<h3 data-i18n="resultPickDetails"></h3><pre id="result-pick-details"></pre>'
    )
}
