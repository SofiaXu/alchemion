export type Locale = 'en' | 'zh'
const messages = {
  workbench: ['Structure workbench', '结构工作台'],
  camera: ['Camera', '相机'],
  molecular: ['Molecular', '分子'],
  periodic: ['Periodic', '周期结构'],
  tagline: ['Inspect, measure and edit crystals and molecules.', '检查、测量和编辑晶体与分子。'],
  import: ['Import', '导入'],
  display: ['Display', '显示'],
  measure: ['Measure', '测量'],
  edit: ['Edit', '编辑'],
  export: ['Export', '导出'],
  language: ['Language', '语言'],
  undo: ['Undo', '撤销'],
  redo: ['Redo', '重做'],
  cancel: ['Cancel task', '取消任务'],
  recompute: ['Recompute', '重新计算'],
  clear: ['Clear document', '清空文档'],
  empty: ['No structure', '尚无结构'],
  computing: ['Computing', '计算中'],
  ready: ['Ready', '就绪'],
  error: ['Error — source retained', '错误：源结构已保留'],
  cancelled: ['Cancelled — source retained', '已取消：源结构已保留'],
  disposed: ['Closed', '已关闭'],
  reading: ['Reading file', '正在读取文件'],
  sample: ['Built-in sample', '内置样例'],
  moleculeSample: ['Synthetic molecule · four non-coplanar atoms', '合成分子：四个非共面原子'],
  crystalSample: ['Synthetic crystals · two CIF blocks', '合成晶体：两个 CIF block'],
  loadSample: ['Load sample', '载入样例'],
  sampleNote: [
    'Project-authored teaching geometry, MIT. These are not experimental structures. Bundled samples need no external database.',
    '项目自产教学几何，MIT 许可，并非实验结构。样例随应用打包，无需外部数据库。'
  ],
  file: ['Local CIF or MOL file', '本地 CIF 或 MOL 文件'],
  format: ['Format', '格式'],
  input: ['File contents', '文件内容'],
  importText: ['Read / import', '读取 / 导入'],
  block: ['CIF data block', 'CIF 数据 block'],
  chooseBlock: ['Select a block explicitly', '请显式选择一个 block'],
  version: ['Detected version', '识别版本'],
  importHelp: [
    'Automatically detects CIF 1/2 and MOL V2000/V3000. POSCAR is export only. Failed parsing keeps the current document.',
    '自动识别 CIF1/2 和 MOL V2000/V3000；POSCAR 仅导出。解析失败保留当前文档。'
  ],
  renderMode: ['Render mode', '显示模式'],
  spaceFilling: ['Space filling', '空间填充'],
  ballStick: ['Ball and stick', '球棍'],
  atomScale: ['Atom scale', '原子尺寸倍率'],
  ballRadius: ['Ball radius (Å)', '球半径（Å）'],
  bondRadius: ['Bond radius (Å)', '键半径（Å）'],
  missingRadius: ['Missing display radius (Å)', '缺失显示半径（Å）'],
  lattice: ['Cell and lattice directions', '晶胞与晶格方向'],
  symmetry: ['Symmetry mates', '对称等价位置'],
  reciprocal: ['Reciprocal lattice (Å⁻¹)', '倒易晶格（Å⁻¹）'],
  bz: ['First Brillouin zone (Å⁻¹)', '第一布里渊区（Å⁻¹）'],
  infer: ['Infer geometric bonds', '推断几何键'],
  performance: ['Performance overlay', '性能信息'],
  neighbors: ['Neighbor cell offsets', '邻胞偏移'],
  neighborHelp: [
    'Integer triples, one per line: 1 0 0. Empty means the central cell only.',
    '每行一个整数三元组，如 1 0 0；留空时仅显示中心晶胞。'
  ],
  cutoff: ['Boundary cutoff', '边界截取'],
  none: ['None', '无'],
  fraction: ['Fractional margin', '分数坐标边距'],
  bond: ['Bond endpoints', '成键端点'],
  margin: ['Fractional margin x y z', '分数坐标边距 x y z'],
  applyDisplay: ['Apply display settings', '应用显示设置'],
  style: ['Element style', '元素样式'],
  element: ['Element', '元素'],
  color: ['Color', '颜色'],
  vdwRadius: ['Space-filling radius (Å)', '空间填充半径（Å）'],
  applyStyle: ['Apply element style', '应用元素样式'],
  resetStyle: ['Use default element style', '恢复默认元素样式'],
  center: ['Fit structure', '适配结构'],
  rotate: ['Rotate 15°', '旋转 15°'],
  zoomIn: ['Zoom in', '放大'],
  zoomOut: ['Zoom out', '缩小'],
  interaction: ['Interaction tool', '交互工具'],
  select: ['Select atom or bond', '选择原子或键'],
  point: ['Pick a surface / view-plane point', '拾取表面 / 视平面点'],
  distance: ['Distance · 2 atoms', '距离：2 个原子'],
  angle: ['Angle · 3 atoms', '角度：3 个原子'],
  torsion: ['Signed dihedral · 4 atoms', '有符号二面角：4 个原子'],
  applyTool: ['Activate tool', '启用工具'],
  measureHelp: [
    'Click atoms in order. Measurements use displayed atom centers in Å and degrees. Surface points are separate. Drag to orbit; wheel to zoom.',
    '按顺序点击原子。测量使用显示实例中心，单位为 Å 和度；表面点单独展示。拖动旋转，滚轮缩放。'
  ],
  inspection: ['Inspection', '检查结果'],
  selection: ['Selection and source mapping', '选择及回源信息'],
  pointResult: ['Picked point', '拾取点'],
  measurement: ['Measurement', '测量结果'],
  noSelection: ['Select an atom or bond in the viewport.', '在视图中选择原子或键。'],
  noPoint: ['Activate the point tool, then click the viewport.', '启用点工具后点击视图。'],
  noMeasurement: [
    'Activate a measurement tool and choose atoms in order.',
    '启用测量工具并按顺序选点。'
  ],
  atomEditor: ['Source atom editor', '源原子编辑'],
  atomId: ['Stable atom ID', '稳定原子 ID'],
  coordinateFrame: ['Coordinate frame', '坐标系'],
  fractional: ['Fractional', '分数坐标'],
  cartesian: ['Cartesian (Å)', '笛卡尔坐标（Å）'],
  position: ['Position x y z', '位置 x y z'],
  applyAtom: ['Apply element and position', '应用元素及位置'],
  addAtom: ['Add atom', '增加原子'],
  deleteAtom: ['Delete source atom', '删除源原子'],
  editHelp: [
    'Choose a source row or pick an atom. One submit is one history transaction. Periodic coordinates have an explicit frame.',
    '选择源原子行或拾取原子；一次提交对应一次历史事务。周期坐标使用显式坐标系。'
  ],
  instancePosition: ['Selected instance position x y z (Å)', '所选实例位置 x y z（Å）'],
  moveInstance: ['Move instance, map back to source', '移动实例并回写源原子'],
  cellEditor: ['Cell parameters', '晶胞参数'],
  cellHelp: [
    'Lengths in Å; angles in degrees. Editing the cell keeps source fractional coordinates.',
    '长度为 Å，角度为度；修改晶胞保持源分数坐标。'
  ],
  resetP1: [
    'Explicitly reset symmetry to P1 in this transaction',
    '在本次事务中显式将对称性重置为 P1'
  ],
  applyCell: ['Apply cell', '应用晶胞'],
  sourceAtoms: ['Source atoms', '源原子'],
  previous: ['Previous', '上一页'],
  next: ['Next', '下一页'],
  source: ['Source', '源'],
  atoms: ['atoms', '个原子'],
  revision: ['Revision', '修订'],
  exportVersion: ['Output version', '输出版本'],
  finite: ['Finite selection for periodic MOL', '周期 MOL 的有限选择'],
  finiteNone: ['No finite selection', '未指定有限选择'],
  finiteSource: ['Explicit source atom IDs', '显式源原子 ID'],
  finiteInstances: ['Collected displayed instances', '已收集的显示实例'],
  sourceIds: ['Source IDs (comma or whitespace separated)', '源 ID（逗号或空白分隔）'],
  useAll: ['Choose all current source atoms', '选择当前全部源原子'],
  collectInstance: ['Add selected instance', '加入所选实例'],
  clearInstances: ['Clear collected instances', '清空实例集合'],
  exportHelp: [
    'Check scientific losses first, then explicitly accept the listed losses for this revision and these options. Hard limits still apply. POSCAR cannot be re-imported.',
    '先检查科学损失，再显式接受当前修订及选项的已列损失；硬性格式限制仍有效。POSCAR 不支持重新导入。'
  ],
  preview: ['Check export', '检查导出'],
  acceptLoss: ['Accept these reported losses', '接受本次已列出的损失'],
  download: ['Download file', '下载文件'],
  reimport: ['Re-import this output', '重新导入当前输出'],
  output: ['Export preview', '导出预览'],
  mapping: ['Export atom mapping', '导出原子映射'],
  diagnostics: ['Diagnostics', '诊断'],
  importDiagnostics: ['Import diagnostics', '导入诊断'],
  runtimeDiagnostics: ['Runtime diagnostics', '运行诊断'],
  exportDiagnostics: ['Export diagnostics', '导出诊断'],
  noDiagnostics: ['No diagnostics.', '暂无诊断。'],
  sources: ['Sources and licenses', '来源与许可'],
  unavailable: [
    'WebGL2 is unavailable. Enable WebGL2 in a desktop browser and reload.',
    'WebGL2 不可用。请在启用 WebGL2 的桌面浏览器中重新载入。'
  ],
  idle: ['Use the tools to inspect or edit the current source.', '使用工具检查或编辑当前源结构。'],
  completed: ['Operation completed.', '操作已完成。'],
  cancelledNote: [
    'Task cancelled. The accepted source and history are retained; recompute to recover the display.',
    '任务已取消；已接受的源及历史保留，可重新计算恢复显示。'
  ],
  selectAtom: ['Choose a source atom first.', '请先选择源原子。'],
  selectInstance: ['Pick a displayed atom instance first.', '请先拾取一个显示原子实例。'],
  invalidNumber: ['Enter finite numbers in every required field.', '请为必填字段输入有限数值。'],
  invalidVector: ['Enter exactly three finite numbers.', '请恰好输入三个有限数值。'],
  invalidNeighbors: ['Neighbor offsets must be integer triples.', '邻胞偏移必须为整数三元组。'],
  emptyDocument: ['Import a structure first.', '请先导入结构。'],
  exportChanged: [
    'Source or options changed. Check the export again.',
    '源结构或选项已改变，请重新检查导出。'
  ],
  fileReadFailed: ['The local file could not be read.', '无法读取本地文件。'],
  count: ['Collected instances', '已收集实例'],
  cellOnly: ['Cell controls apply to periodic structures.', '晶胞控件适用于周期结构。']
} satisfies Record<string, readonly [string, string]>
export type Message = keyof typeof messages
let locale: Locale
try {
  const saved = localStorage.getItem('alchemion.demo.locale')
  locale =
    saved === 'en' || saved === 'zh' ? saved : navigator.language.startsWith('zh') ? 'zh' : 'en'
} catch {
  locale = navigator.language.startsWith('zh') ? 'zh' : 'en'
}
export const getLocale = () => locale
export const tr = (key: Message): string => messages[key][locale === 'zh' ? 1 : 0]
export function setLocale(next: Locale) {
  locale = next
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  try {
    localStorage.setItem('alchemion.demo.locale', next)
  } catch {
    /* Storage is optional. */
  }
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = tr(el.dataset.i18n as Message)
  })
}
