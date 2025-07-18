import { LocaleData } from '../I18nManager';

/**
 * 简体中文翻译
 */
export const zhCNTranslations: LocaleData = {
  general: {
    loading: '加载中...',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    remove: '移除',
    confirm: '确认',
    close: '关闭',
    search: '搜索',
    clear: '清除',
    refresh: '刷新',
    error: '错误',
    success: '成功',
    warning: '警告',
    info: '信息',
    more: '更多',
    from: '来自',
    page: '页',
    next: '下一页',
    previous: '上一页',
    updating: '更新中',
    remaining: '剩余',
  },
  settings: {
    title: '宏营养素设置（三大营养素）',
    storage: {
      title: '存储',
      folder: '存储文件夹',
      folderDesc: '用于保存带有食物营养数据的 .md 文件的位置',
    },
    targets: {
      title: '每日营养目标',
      calories: '每日热量目标',
      caloriesDesc: '你的每日热量摄入目标（千卡）',
      protein: '每日蛋白质目标',
      proteinDesc: '你的每日蛋白质摄入目标（克）',
      fat: '每日脂肪目标',
      fatDesc: '你的每日脂肪摄入目标（克）',
      carbs: '每日碳水目标',
      carbsDesc: '你的每日碳水化合物摄入目标（克）',
    },
    display: {
      title: '显示',
      showSummaryRows: '显示汇总行',
      showSummaryRowsDesc: '切换是否在宏表格中显示总计、目标和剩余行。',
      disableTooltips: '禁用工具提示',
      disableTooltipsDesc: '关闭所有宏表格中的悬停提示，界面更简洁。',
      showCellPercentages: '显示单元格百分比',
      showCellPercentagesDesc: '在表格中显示宏单元格的百分比值。',
      energyUnit: '能量单位',
      energyUnitDesc: '选择能量显示单位：千卡（kcal）或千焦（kJ）',
      energyUnitKcal: '千卡（kcal）',
      energyUnitKj: '千焦（kJ）',
      energyConversionNote: '能量值会自动在千卡和千焦之间转换（1 kcal = 4.184 kJ）',
      addToMacrosTabOrder: '添加到宏量表标签顺序',
      addToMacrosTabOrderDesc: '通过拖放下面的项目来自定义"添加到宏量表"模态框中标签的顺序。',
      tabOrderInstructions: '拖放下面的项目来更改标签顺序。第一个项目将成为默认的活动标签。',
      dragToReorder: '拖拽重新排序',
    },
    charts: {
      title: '饼图自定义',
      proteinColor: '蛋白质颜色',
      proteinColorDesc: '饼图中代表蛋白质的颜色',
      fatColor: '脂肪颜色',
      fatColorDesc: '饼图中代表脂肪的颜色',
      carbsColor: '碳水化合物颜色',
      carbsColorDesc: '饼图中代表碳水化合物的颜色',
      preview: '饼图预览',
    },
    meals: {
      title: '餐食模板',
      description: '创建可复用的餐食模板，用于快速添加至你的宏营养记录',
      create: '创建新的餐食模板',
      createDesc: '创建一组搭配好的食物套餐。',
      addButton: '+ 创建餐食模板',
      noTemplates: '暂无餐食模板。请点击上方按钮创建。',
    },
    api: {
      title: 'API 配置（必需）',
      description:
        '如需使用食物搜索功能，需注册免费的 FatSecret API 凭证。插件不包含默认 API 密钥。',
      signupText: '在此注册免费 API 凭证：',
      securityNote: '你的 API 凭证将安全存储在你的库设置中。',
      notConfigured: '⚠️ 未配置 API 凭证。添加凭证前无法使用食物搜索。',
      configured: '✅ API 凭证配置成功。',
      key: 'FatSecret API key',
      keyDesc: '你的 FatSecret API key（食物搜索必需）',
      secret: 'FatSecret API secret',
      secretDesc: '你的 FatSecret API secret（食物搜索必需）',
      testConnection: '测试 API 连接',
      testConnectionDesc: '点击测试你的 FatSecret API 凭证。',
    },
    developer: {
      title: '开发者模式',
      enable: '启用开发者模式',
      enableDesc: '启用调试日志和开发者命令。仅在需要排查插件问题时使用。',
      active: '开发者模式已激活。命令面板中有更多开发者命令。',
    },
  },
  food: {
    search: {
      title: '搜索食物',
      placeholder: '输入关键字以搜索，仅支持英文（如：Apple）',
      noResults: '未找到结果，请尝试其他关键词。',
      searching: '搜索中...',
      results: '“{searchTerm}” 的结果（共 {page} 页）',
    },
    entry: {
      title: '添加食物',
      description: '请选择添加食物的方式：',
      liveSearch: '在线搜索',
      liveSearchDesc: '在 FatSecret 数据库中搜索营养信息',
      manualEntry: '手动录入',
      manualEntryDesc: '手动输入食物的营养信息',
      apiConfigured: '✓ API 已配置',
      apiNotConfigured: '⚠ API 未配置',
      alwaysAvailable: '✓ 始终可用',
    },
    manual: {
      title: '手动录入食物',
      description: '请输入该食物的营养信息：',
      foodName: '食物名称',
      servingSize: '份量 (克)',
      calories: '热量 (千卡)',
      energy: '能量',
      protein: '蛋白质 (克)',
      fat: '脂肪 (克)',
      carbs: '碳水化合物 (克)',
      required: '* 必填项',
      save: '保存食物',
      multipleEntryDesc: '您可以使用"添加并继续"按钮在一个会话中添加多个食物。',
      addedItems: '已添加的食物',
      noItemsAdded: '尚未添加任何食物',
      addAnotherItem: '添加另一个食物',
      enterFoodInfo: '输入食物信息',
      addAndContinue: '添加并继续',
      addThisItem: '添加此食物',
      finishAdding: '完成添加',
      itemSavedSuccessfully: '食物已成功保存！',
      itemSavedReadyForNext: '已保存！准备添加下一个。',
      allItemsSaved: '所有 {{count}} 个食物已成功保存！',
      itemRemoved: '已从列表中移除食物',
      keyboardShortcuts: '提示：按回车保存，Ctrl+回车添加并继续',
    },
    customServing: {
      title: '{foodName} 的自定义份量',
      description: '默认份量为 {defaultServing}g。请输入自定义克数：',
      submit: '提交',
    },
  },
  meals: {
    create: {
      title: '创建新餐食模板',
      description: '为你的餐食模板命名，然后搜索并选择要包含的食物。',
      nameLabel: '模板名称',
      namePlaceholder: '如：早餐、锻炼后补充 等',
      searchPlaceholder: '搜索食物...',
      availableFoods: '🥗 可用食物',
      selectedItems: '已选项目',
      createGroup: '🗂️ 创建分组',
      groupName: '分组名称',
      groupNamePlaceholder: '输入分组名称（例如：早餐、午餐）',
      selectFoodsForGroup: '为此分组选择食物',
      addToGroup: '添加到分组',
      noSelectedItems: '尚未选择任何项目',
      noResults: '未找到食物',
      addToMeal: '+ 添加到餐食',
      remove: '− 移除',
      editServing: '✎ 份量',
      create: '创建餐食模板',
      customServing: '自定义：{serving}g',
      defaultServing: '默认：{serving}',
    },
    edit: {
      title: '编辑餐食模板：“{mealName}”',
      description: '搜索并选择要包含在此模板中的食物。可为每项自定义份量。',
      saveChanges: '保存更改',
    },
    addTo: {
      title: '添加项目到宏营养表',
      description: '搜索并选择餐食模板或单个食物，添加到你的宏表格。',
      searchPlaceholder: '搜索餐食和食物...',
      mealTemplates: '🍽️ 餐食模板',
      individualFoods: '🥗 单个食物',
      selectedItems: '已选项目',
      createGroup: '🗂️ 创建分组',
      groupName: '分组名称',
      groupNamePlaceholder: '输入分组名称（例如：早餐、午餐）',
      selectFoodsForGroup: '为此分组选择食物',
      addToGroup: '+ 添加到分组',
      enterGroupNameFirst: '请先输入分组名称',
      pendingGroup: '待定分组',
      noSelectedItems: '尚未选择项目',
      addSelectedItems: '添加所选项目',
      addMeal: '+ 添加餐食',
      addFood: '+ 添加食物',
      added: '✓ 已添加',
    },
  },
  table: {
    headers: {
      food: '食物',
      serving: '份量',
      calories: '热量',
      protein: '蛋白质',
      fat: '脂肪',
      carbs: '碳水',
      servingShort: '数量',
      caloriesShort: '热',
      proteinShort: '蛋白',
      fatShort: '脂肪',
      carbsShort: '碳水',
    },
    summary: {
      totals: '总计',
      targets: '目标',
      remaining: '剩余',
      today: '今日摄入总量',
      yesterday: '昨日摄入总量',
      date: '{date} 摄入总量',
      over: '超出',
      macrosSummary: '宏营养素汇总',
      dailyTarget: '占比',
      otherItems: '非餐食摄入',
    },
    actions: {
      addItems: '添加项目',
      collapseAll: '全部折叠',
      expandAll: '全部展开',
      removeItem: '移除项目',
      clickToEdit: '点击编辑',
      longPressToDelete: '长按删除',
      removeFromMeal: '将 {itemName} 从「{mealName}」移除',
      removeGroup: '删除分组',
      removeMeal: '删除餐食',
      longPressForOptions: '长按查看选项',
      rightClickForOptions: '右键查看选项',
    },
    meal: {
      items: '{count} 项',
      calories: '{calories} 千卡',
    },
    confirmDelete: {
      mealitem: '从餐食中移除此项目？',
      mealitemContext: '这将从你的餐食中移除所选食物，操作不可撤销。',
      item: '移除“{itemName}”？',
      itemContext: '此操作不可撤销。',
    },
  },
  charts: {
    title: '今日宏营养素',
    titleDate: '{date} 的宏营养素',
    titleCombined: '合并宏营养素（最近 {days} 天）',
    titleMultiple: '合并宏营养素：{ids}',
    calories: '热量：',
    noMacros: '未找到 ID 为 {ids} 的宏营养素',
    noData: '未找到 ID 为 {ids} 的数据',
    loading: '图表数据加载中...',
    error: '无法渲染宏图表，请刷新页面。',
    errors: {
      noIdsProvided: '宏区块未提供 id',
      renderError: '渲染图表出错：{error}',
    },
  },
  calculator: {
    title: '宏营养素计算器',
    description: '为所选宏表格计算营养总量。',
    selectTables: '选择要参与计算的宏表格：',
    noTables: '未找到宏表格，请先创建。',
    calculate: '计算总量',
    results: '计算结果',
    aggregate: '总计',
    breakdown: '按表格分解',
    combinedTotals: '合计',
    noDetailData: '无详细数据。',
    chartTitle: '随时间变化的营养趋势',
    notEnoughData: '至少需要 2 个数据点才能显示趋势（当前有 {count} 个）',
    chartError: '图表错误：{error}',
    dataSummary: '数据汇总：',
    quantity: '数量',
    standardQuantity: '标准',
    errorLoadingData: '加载数据出错：{error}',
    summaryDays: '汇总（最近 {count} 天）',
    summaryTables: '汇总（{count} 个表格）',
    chartAxisDate: '日期/ID',
    chartAxisGrams: '克',
    tableHeaders: {
      id: '表格 ID',
    },
    tooltips: {
      calories: '{value} 千卡，来自 {id}（占总量 {percentage}%）',
      macro: '{value} {macro}（占总营养素 {percentage}%）',
    },
    errors: {
      noContent: '错误：宏计算区块未提供内容。',
      noIds: '错误：请使用 "id:" 或 "ids:" 指定表格 ID',
      noTableIds: '错误：未提供表格 ID。',
    },
  },
  commands: {
    forceReload: '强制重新加载所有宏',
    addFood: '添加食物（搜索或手动录入）',
    toggleDebug: '切换调试模式',
  },
  notifications: {
    foodSaved: '已保存 {fileName}',
    foodSaveError: '保存食物出错：{error}',
    mealTemplateCreated: '餐食模板“{name}”创建成功，共有 {count} 项食物',
    mealTemplateUpdated: '餐食模板“{name}”更新成功',
    itemsAdded: '已添加 {count} 项到你的宏表格。',
    itemsAddError: '添加项目出错：{error}',
    reloadComplete: '重新加载完成！',
    reloadInProgress: '正在强制重新加载所有宏数据...',
    debugEnabled: '调试模式已启用',
    debugDisabled: '调试模式已关闭',
    testConnectionSuccess: '测试连接成功！',
    testConnectionFailed: '测试连接失败，请检查 API 凭证。',
    apiCredentialsRequired: '请先配置 API 凭证。',
    chartPreviewUnavailable: '无法预览图表',
    developerModeChanged: '开发者模式{status}。重启 Obsidian 以应用全部更改。',
    languageChanged: '语言已切换为 {language}。重启 Obsidian 以生效。',
    itemRemoved: '已移除项目 {item}',
    itemRemoveError: '移除项目出错：{error}',
    removalCancelled: '已取消移除',
    quantityUpdateError: '更新数量出错：{error}',
  },
  validation: {
    required: '此项为必填',
    invalidNumber: '请输入有效数字',
    invalidServing: '请输入有效的份量',
    duplicateName: '已存在名为“{name}”的食物',
    duplicateMealName: '已存在同名餐食模板，请更换名称。',
    selectAtLeastOne: '请至少选择一项',
    enterMealName: '请输入餐食名称',
    noNutritionData: '无法处理该食物的营养数据。',
  },
  comments: {
    addMealComment: '添加餐食备注',
    editMealComment: '编辑餐食备注',
    addItemComment: '添加食物备注',
    editItemComment: '编辑食物备注',
    mealDescription: '为餐食添加备注：{mealName}',
    itemDescription: '为食物添加备注：{itemName}',
    commentLabel: '备注：',
    mealPlaceholder: '例如："运动后餐食" 或 "高蛋白早餐"',
    itemPlaceholder: '例如："有机品牌" 或 "当地商店购买"',
    addComment: '添加备注',
    updateComment: '更新备注',
    removeComment: '删除备注',
    commentAdded: '备注添加成功',
    commentUpdated: '备注更新成功',
    commentRemoved: '备注删除成功',
    saveError: '保存备注时出错：{error}',
    removeError: '删除备注时出错：{error}',
    tooLong: '备注过长（最多200个字符）',
    contextMenu: {
      addComment: '添加备注',
      editComment: '编辑备注',
      removeComment: '删除备注',
    },
  },
  tooltips: {
    percentage: '{value}g {macro} • 占每日{macro}目标的 {percent}%',
    remaining: '剩余',
    over: '超额 {over}g',
    targetExceeded: '（超出目标）',
    approachingTarget: '（接近目标）',
    calories: '{value} 千卡 • 占每日目标 {percent}% • 剩余热量',
    caloriesOver: '{value} 千卡 • 占每日目标 {percent}% • 超出 {over} 千卡',
    caloriePercent: '{value} 千卡 • 占每日目标 {percent}%',
    macroComposition: '{value}g {macro}（占总营养素 {percent}%）',
    target: '目标：{target}{unit}',
    dailyTarget: '占每日目标',
  },
  errors: {
    fileNotFound: '未找到所选食物。',
    noNutritionData: '该项目无营养数据。',
    invalidServing: '默认份量无效。',
    chartCreationFailed: '创建图表出错',
    dataLoadTimeout: '数据加载超时',
    chartLibraryNotAvailable: '图表库不可用',
    macrosNotFound: '未找到 ID 为 {id} 的宏区块',
    updateFailed: '未找到用于更新的 ID 为 {id} 的宏区块',
    apiConnectionFailed: '搜索食物出错，请重试。',
    unknownError: '发生未知错误',
    noActiveFile: '无活动文件',
    macrosBlockNotFound: '未找到餐食“{mealName}”的宏区块',
    noMacrosData: '未找到宏数据',
    mealNotFound: '未找到餐食“{mealName}”',
    foodItemNotFound: '在餐食“{mealName}”中未找到食物“{foodName}”',
    updateMacrosBlockFailed: '更新宏区块失败',
  },
  suggestions: {
    today: '今天',
    todayDesc: '插入今天的日期',
    yesterday: '昨天',
    yesterdayDesc: '插入昨天的日期',
    thisWeek: '本周',
    thisWeekDesc: '插入包括今天在内的最近7天',
    lastWeek: '上周',
    lastWeekDesc: '插入上一周（7天）',
    thisMonth: '本月',
    thisMonthDesc: '插入从月初到今天的所有日期',
    lastMonth: '上月',
    lastMonthDesc: '插入上个月的所有日期',
  },
  dates: {
    months: {
      january: '一月',
      february: '二月',
      march: '三月',
      april: '四月',
      may: '五月',
      june: '六月',
      july: '七月',
      august: '八月',
      september: '九月',
      october: '十月',
      november: '十一月',
      december: '十二月',
    },
    monthsShort: {
      jan: '1月',
      feb: '2月',
      mar: '3月',
      apr: '4月',
      may: '5月',
      jun: '6月',
      jul: '7月',
      aug: '8月',
      sep: '9月',
      oct: '10月',
      nov: '11月',
      dec: '12月',
    },
    weekdays: {
      monday: '星期一',
      tuesday: '星期二',
      wednesday: '星期三',
      thursday: '星期四',
      friday: '星期五',
      saturday: '星期六',
      sunday: '星期日',
    },
    weekdaysShort: {
      mon: '周一',
      tue: '周二',
      wed: '周三',
      thu: '周四',
      fri: '周五',
      sat: '周六',
      sun: '周日',
    },
    today: '今天',
    yesterday: '昨天',
    tomorrow: '明天',
  },
};
