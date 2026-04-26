// pages/history/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    historyList: [],
    isLoading: true
  },

  onLoad: function(options) {
    const { roomId } = options
    if (!roomId) {
      wx.showToast({
        title: '参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ roomId })
    this.loadHistory()
  },

  loadHistory: function() {
    this.setData({ isLoading: true })

    wx.cloud.callFunction({
      name: 'getExpenseHistory',
      data: {
        roomId: this.data.roomId
      },
      success: (res) => {
        if (res.result && res.result.success) {
          // 注意：云函数返回的数据在 res.result.data.history 中
          const historyData = res.result.data?.history || res.result.data || []
          const historyList = this.processHistoryData(historyData)
          this.setData({ historyList })
        } else {
          console.error('获取历史记录失败:', res.result)
          this.setData({ historyList: [] })
        }
      },
      fail: (err) => {
        console.error('获取历史记录失败:', err)
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        })
        this.setData({ historyList: [] })
      },
      complete: () => {
        this.setData({ isLoading: false })
      }
    })
  },

  processHistoryData: function(data) {
    if (!data || data.length === 0) return []

    // 按日期分组
    const grouped = {}
    data.forEach(item => {
      const date = new Date(item.operatedAt)
      const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`

      if (!grouped[dateStr]) {
        grouped[dateStr] = {
          dateStr,
          records: []
        }
      }

      // 根据操作类型设置显示文本
      let actionText = '数据更新'
      if (item.operation === 'create') actionText = '新增支出'
      else if (item.operation === 'update') actionText = '修改支出'
      else if (item.operation === 'delete') actionText = '删除支出'
      else if (item.operation === 'restore') actionText = '恢复备份'

      grouped[dateStr].records.push({
        ...item,
        actionText
      })
    })

    // 转换为数组并按日期和时间排序（最新的在前）
    return Object.values(grouped).sort((a, b) => {
      const dateA = new Date(a.records[0]?.operatedAt || 0)
      const dateB = new Date(b.records[0]?.operatedAt || 0)
      return dateB - dateA
    })
  },

  onRestore: function(e) {
    const record = e.currentTarget.dataset.record

    wx.showModal({
      title: '恢复数据',
      content: '确定要恢复到该版本吗？当前数据将被覆盖。',
      success: (res) => {
        if (res.confirm) {
          this.doRestore(record)
        }
      }
    })
  },

  doRestore: function(record) {
    wx.showLoading({ title: '恢复中...' })

    wx.cloud.callFunction({
      name: 'restoreFromHistory',
      data: {
        roomId: this.data.roomId,
        versionId: record._id,
        userName: app.getUserInfo().userName
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({
            title: '恢复成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          wx.showToast({
            title: res.result?.message || '恢复失败',
            icon: 'error'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('恢复失败:', err)
        wx.showToast({
          title: '网络错误',
          icon: 'error'
        })
      }
    })
  },

  onPullDownRefresh: function() {
    this.loadHistory()
    wx.stopPullDownRefresh()
  }
})