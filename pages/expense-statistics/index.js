// pages/expense-statistics/index.js
const app = getApp()

// 类别颜色配置
const CATEGORY_COLORS = {
  '餐饮': '#FF6B6B',
  '交通': '#4ECDC4',
  '住宿': '#45B7D1',
  '购物': '#96CEB4',
  '娱乐': '#FFEAA7',
  '其他': '#DDA0DD'
}

// 类别图标
const CATEGORY_ICONS = {
  '餐饮': '🍽️',
  '交通': '🚗',
  '住宿': '🏨',
  '购物': '🛍️',
  '娱乐': '🎮',
  '其他': '📝'
}

Page({
  data: {
    roomId: '',
    totalAmount: 0,
    categoryStats: [],
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
    this.loadExpenses()
  },

  onShow: function() {
    if (this.data.roomId) {
      this.loadExpenses()
    }
  },

  loadExpenses: function() {
    this.setData({ isLoading: true })
    console.log('开始加载支出, roomId:', this.data.roomId)

    const db = wx.cloud.database()
    db.collection('expenses')
      .where({
        roomId: this.data.roomId
      })
      .get({
        success: (res) => {
          console.log('加载支出成功, 数据:', res.data)
          const expenses = res.data || []
          this.processData(expenses)
          this.setData({ isLoading: false })
        },
        fail: (err) => {
          console.error('加载支出失败:', err)
          wx.showToast({
            title: '加载失败',
            icon: 'error'
          })
          this.setData({ isLoading: false })
        }
      })
  },

  processData: function(expenses) {
    console.log('处理数据, 条数:', expenses?.length || 0)
    if (!expenses || expenses.length === 0) {
      console.log('没有支出数据')
      this.setData({
        totalAmount: 0,
        totalAmountStr: '0.00',
        categoryStats: [],
        isLoading: false
      })
      return
    }

    // 计算总支出
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    console.log('总支出:', totalAmount)

    // 按类别分组统计
    const categoryMap = {}
    expenses.forEach(expense => {
      const category = expense.category || '其他'
      if (!categoryMap[category]) {
        categoryMap[category] = {
          category,
          amount: 0,
          count: 0,
          color: CATEGORY_COLORS[category] || '#999',
          icon: CATEGORY_ICONS[category] || '📝'
        }
      }
      categoryMap[category].amount += expense.amount || 0
      categoryMap[category].count += 1
    })

    // 转换为数组并计算百分比
    const categoryStats = Object.values(categoryMap)
      .map(item => ({
        ...item,
        amountStr: item.amount.toFixed(2),
        percent: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
        percentStr: (totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0).toFixed(1)
      }))
      .sort((a, b) => b.amount - a.amount)

    this.setData({
      totalAmount,
      totalAmountStr: totalAmount.toFixed(2),
      categoryStats
    })
  }
})