// 统一表单页 — 分发 + 提交
var api = require('../../utils/api')
var app = getApp()

// 节流
var lastSubmitTime = 0
var SUBMIT_GAP = 2000

// 模块 → 组件名映射
var COMPONENT_MAP = {
  'jobseeker': 'form-jobseeker',
  'work':      'form-work',
  'custom':    'form-custom',
  'study':     'form-custom',
  'freelance': 'form-custom'
}

// 模块名映射
var MODULE_NAMES = {
  'jobseeker': '岗位',
  'work': '工作任务',
  'custom': '自定义任务',
  'study': '学习任务',
  'freelance': '自由任务'
}

Page({
  data: {
    loadingData: false,
    mode: 'create',
    module: '',
    componentName: '',
    initialData: {},
    // 编辑专用
    editId: '',
    editType: ''   // 'task' | 'job'
  },

  onLoad(options) {
    if (!options || !options.mode) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1000)
      return
    }

    var ctx = this
    var mode = options.mode
    var module = options.module || ''

    if (mode === 'edit') {
      // 编辑模式：加载已有数据
      var editType = options.type
      var editId = options.id
      wx.setNavigationBarTitle({ title: '编辑' })
      this.setData({ loadingData: true, mode: 'edit', editId: editId, editType: editType })

      if (editType === 'job') {
        this.loadJob(editId)
      } else if (editType === 'task') {
        this.loadTask(editId)
      } else {
        wx.showToast({ title: '未知编辑类型', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1000)
      }
    } else {
      // 创建模式
      var componentName = COMPONENT_MAP[module] || 'form-custom'
      var title = '添加' + (MODULE_NAMES[module] || '任务')
      wx.setNavigationBarTitle({ title: title })
      this.setData({
        mode: 'create',
        module: module,
        componentName: componentName,
        initialData: {},
        loadingData: false
      })
    }
  },

  loadJob(id) {
    var ctx = this
    api.getJobList().then(function (res) {
      var job = (res.jobs || []).find(function (j) { return j._id === id })
      if (job) {
        wx.setNavigationBarTitle({ title: '编辑岗位' })
        ctx.setData({
          module: 'jobseeker',
          componentName: 'form-jobseeker',
          initialData: job,
          loadingData: false
        })
      } else {
        wx.showToast({ title: '岗位不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1000)
      }
    }).catch(function () {
      ctx.setData({ loadingData: false })
    })
  },

  loadTask(id) {
    var ctx = this
    api.getTaskList().then(function (res) {
      var task = (res.tasks || []).find(function (t) { return t._id === id })
      if (task) {
        var module = task.module || 'custom'
        var componentName = COMPONENT_MAP[module] || 'form-custom'
        wx.setNavigationBarTitle({ title: '编辑' + (MODULE_NAMES[module] || '任务') })
        ctx.setData({
          module: module,
          componentName: componentName,
          initialData: task,
          loadingData: false
        })
      } else {
        wx.showToast({ title: '任务不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1000)
      }
    }).catch(function () {
      ctx.setData({ loadingData: false })
    })
  },

  // ========== 表单提交 ==========
  onSubmit(e) {
    var now = Date.now()
    if (now - lastSubmitTime < SUBMIT_GAP) return
    lastSubmitTime = now

    var formData = e.detail.formData
    var ctx = this
    var isEdit = this.data.mode === 'edit'

    if (this.data.module === 'jobseeker') {
      var action = isEdit
        ? api.updateJob(Object.assign({ jobId: this.data.editId }, formData))
        : api.addJob(formData)
      action.then(function (res) {
        if (res.success) {
          app.markDirty(['jobs', 'today', 'progress', 'mine'])
          wx.showToast({ title: isEdit ? '已更新' : '已添加', icon: 'success' })
          setTimeout(function () { wx.navigateBack() }, 800)
        } else {
          wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
          ctx.resetComponent()
        }
      }).catch(function () {
        ctx.resetComponent()
      })
    } else {
      // 任务类型：补齐 module 字段
      formData.module = this.data.module
      var action = isEdit
        ? api.updateTask(Object.assign({ taskId: this.data.editId }, formData))
        : api.addTask(formData)
      action.then(function (res) {
        if (res.success) {
          app.markDirty(['tasks', 'today', 'progress', 'mine'])
          wx.showToast({ title: isEdit ? '已更新' : '已添加', icon: 'success' })
          setTimeout(function () { wx.navigateBack() }, 800)
        } else {
          wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
          ctx.resetComponent()
        }
      }).catch(function () {
        ctx.resetComponent()
      })
    }
  },

  // 通知子组件恢复按钮状态
  resetComponent() {
    var comp = this.selectComponent('#' + this.data.componentName)
    if (comp && comp.resetSubmitting) {
      comp.resetSubmitting()
    }
  },

  // ========== 取消 ==========
  onCancel() {
    wx.navigateBack()
  }
})
