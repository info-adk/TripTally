// pages/add-expense/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    expenseId: '', // 编辑模式时使用
    isEdit: false,
    // 表单数据
    amount: '',
    selectedCategory: '餐饮',
    description: '',
    payerIndex: 0,
    date: '',
    participants: {}, // userName -> boolean
    // 数据
    members: [],
    categories: [
      { value: '餐饮', name: '餐饮', icon: '🍽️' },
      { value: '交通', name: '交通', icon: '🚗' },
      { value: '住宿', name: '住宿', icon: '🏨' },
      { value: '购物', name: '购物', icon: '🛍️' },
      { value: '娱乐', name: '娱乐', icon: '🎮' },
      { value: '其他', name: '其他', icon: '📝' }
    ],
    currentUserName: '',
    maxDate: '',
    // 状态
    isLoading: false,
    isFormValid: false,
    errorMessage: ''
  },

  onLoad: function(options) {
    const { roomId, expenseId } = options
    if (!roomId) {
      wx.showToast({
        title: '房间参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({
      roomId,
      expenseId: expenseId || '',
      isEdit: !!expenseId
    })
    this.initPage()
  },

  // 初始化页面
  initPage: function() {
    const app = getApp()
    const userInfo = app.getUserInfo()

    // 设置当前用户ID
    this.setData({ currentUserName: userInfo.userName })

    // 设置最大日期为今天
    const today = new Date()
    const maxDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
    this.setData({
      date: maxDate,
      maxDate: maxDate
    })

    // 加载房间成员
    this.loadRoomMembers()

    // 如果是编辑模式，加载支出详情
    if (this.data.isEdit) {
      this.loadExpenseDetail()
    }
  },

  // 加载支出详情（编辑模式）
  loadExpenseDetail: function() {
    const db = wx.cloud.database()
    db.collection('expenses').doc(this.data.expenseId).get({
      success: (res) => {
        const expense = res.data
        if (expense) {
          // 设置表单数据
          this.setData({
            amount: expense.amount.toString(),
            selectedCategory: expense.category,
            description: expense.description || '',
            date: expense.date
          })

          // 加载完成员后再设置支付者和参与人
          this.setData({
            isLoading: false
          })
        }
      },
      fail: (err) => {
        console.error('加载支出详情失败:', err)
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        })
      }
    })
  },

  // 加载房间成员
  loadRoomMembers: function() {
    const db = wx.cloud.database()
    db.collection('room_members')
      .where({
        roomId: this.data.roomId,
        isActive: true
      })
      .orderBy('joinedAt', 'asc')
      .get({
        success: (res) => {
          if (res.data.length === 0) {
            // 没有成员，使用默认数据（离线模式可能发生）
            this.initWithDefaultMembers()
            return
          }

          const members = res.data
          const currentUserName = this.data.currentUserName
          const participants = {}
          let payerIndex = 0

          members.forEach((member, index) => {
            participants[member.userName] = true // 默认全选
            if (member.userName === currentUserName) {
              payerIndex = index
            }
          })

          // 如果是编辑模式，需要设置正确的支付者和参与人
          if (this.data.isEdit) {
            const expense = this.data
            // 找到支付者索引
            payerIndex = members.findIndex(m => m.userName === expense.payerName)
            if (payerIndex === -1) payerIndex = 0

            // 设置参与人
            const newParticipants = {}
            members.forEach(member => {
              newParticipants[member.userName] = false
            })
            // 从数据库加载参与人
            this.loadParticipantsAndSet(members, newParticipants, payerIndex)
          } else {
            this.setData({
              members,
              payerIndex,
              participants,
              isFormValid: this.validateForm()
            })
          }
        },
        fail: (err) => {
          console.error('加载成员失败:', err)
          // 加载失败，使用默认数据（离线模式可能发生）
          this.initWithDefaultMembers()
        }
      })
  },

  // 使用默认成员数据初始化
  initWithDefaultMembers: function() {
    const currentUser = app.getUserInfo()
    const members = [{
      userName: currentUser.userName
    }]
    const participants = {}
    participants[currentUser.userName] = true

    this.setData({
      members,
      payerIndex: 0, // 当前用户作为默认支付者
      participants,
      isFormValid: this.validateForm()
    })
  },

  // 加载参与人数据并设置
  loadParticipantsAndSet: function(members, participants, payerIndex) {
    const db = wx.cloud.database()
    db.collection('expenses').doc(this.data.expenseId).get({
      success: (res) => {
        const expense = res.data
        if (expense && expense.participants) {
          expense.participants.forEach(p => {
            if (participants.hasOwnProperty(p.userName)) {
              participants[p.userName] = true
            }
          })
        }
        this.setData({
          members,
          payerIndex,
          participants,
          isFormValid: this.validateForm()
        })
      },
      fail: () => {
        // 失败时也设置默认值
        this.setData({
          members,
          payerIndex,
          participants
        })
      }
    })
  },

  // ========== 表单处理 ==========

  // 金额输入
  onAmountInput: function(e) {
    let value = e.detail.value

    // 限制只能输入数字和小数点
    value = value.replace(/[^\d.]/g, '')

    // 限制小数点后最多两位
    const parts = value.split('.')
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('')
    }
    if (parts.length === 2 && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].substring(0, 2)
    }

    this.setData({
      amount: value,
      isFormValid: this.validateForm()
    })
  },

  // 分类选择
  onCategorySelect: function(e) {
    const category = e.currentTarget.dataset.value
    this.setData({
      selectedCategory: category
    })
  },

  // 描述输入
  onDescriptionInput: function(e) {
    this.setData({
      description: e.detail.value.trim()
    })
  },

  // 支付者选择
  onPayerChange: function(e) {
    const index = e.detail.value
    this.setData({
      payerIndex: parseInt(index)
    })
  },

  // 参与人切换
  onParticipantToggle: function(e) {
    const index = e.currentTarget.dataset.index
    const member = this.data.members[index]
    const participants = { ...this.data.participants }

    participants[member.userName] = !participants[member.userName]

    this.setData({
      participants,
      isFormValid: this.validateForm()
    })
  },

  // 日期选择
  onDateChange: function(e) {
    this.setData({
      date: e.detail.value
    })
  },

  // ========== 表单验证 ==========

  // 验证表单
  validateForm: function() {
    const { amount, participants } = this.data

    // 检查金额
    if (!amount || parseFloat(amount) <= 0) {
      return false
    }

    // 检查至少有一个参与人
    const hasParticipants = Object.values(participants).some(selected => selected)
    if (!hasParticipants) {
      return false
    }

    return true
  },

  // ========== 提交处理 ==========

  // 提交表单
  onSubmit: function() {
    if (!this.validateForm()) {
      this.setData({
        errorMessage: '请填写完整信息'
      })
      return
    }

    const { amount, selectedCategory, description, payerIndex, date, participants, members, isEdit, expenseId } = this.data
    const payer = members[payerIndex]

    if (!payer) {
      this.setData({
        errorMessage: '请选择支付者'
      })
      return
    }

    // 构建参与人列表
    const participantList = []
    Object.keys(participants).forEach(userName => {
      if (participants[userName]) {
        const member = members.find(m => m.userName === userName)
        if (member) {
          participantList.push({
            userName: member.userName
          })
        }
      }
    })

    if (participantList.length === 0) {
      this.setData({
        errorMessage: '至少选择一个参与人'
      })
      return
    }

    this.setData({
      isLoading: true,
      errorMessage: ''
    })

    if (isEdit) {
      // 编辑模式：只能在线提交
      this.submitUpdateOnline(expenseId, amount, selectedCategory, description, payer, date, participantList)
    } else {
      // 新增：检测网络状态
      this.checkAndSubmit(amount, selectedCategory, description, payer, date, participantList)
    }
  },

  // 检测网络并提交
  checkAndSubmit: function(amount, selectedCategory, description, payer, date, participantList) {
    // 如果没有有效的支付者（离线模式可能发生），使用当前用户作为默认值
    const currentUser = app.getUserInfo()
    const actualPayer = payer || { userName: currentUser.userName }

    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          // 无网络，离线保存
          this.saveOfflineExpense(amount, selectedCategory, description, actualPayer, date, participantList)
        } else {
          // 有网络，在线提交
          this.submitAddOnline(amount, selectedCategory, description, actualPayer, date, participantList)
        }
      },
      fail: () => {
        // 获取网络状态失败，默认离线保存
        this.saveOfflineExpense(amount, selectedCategory, description, actualPayer, date, participantList)
      }
    })
  },

  // 保存为离线支出
  saveOfflineExpense: function(amount, selectedCategory, description, payer, date, participantList) {
    const currentUser = app.getUserInfo()
    // 离线时如果 payer 无效，使用当前用户作为支付者
    const actualPayer = payer || { userName: currentUser.userName }

    const expense = {
      roomId: this.data.roomId,
      amount: parseFloat(amount),
      category: selectedCategory,
      description: description || '无备注',
      payerName: actualPayer.userName,
      date: date,
      participants: participantList,
      createdByName: currentUser.userName
    }

    app.saveOfflineExpense(expense)

    this.setData({ isLoading: false })
    wx.showToast({
      title: '已离线保存',
      icon: 'success'
    })
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  },

  // 在线提交新增
  submitAddOnline: function(amount, selectedCategory, description, payer, date, participantList) {
    wx.cloud.callFunction({
      name: 'addExpense',
      data: {
        roomId: this.data.roomId,
        amount: parseFloat(amount),
        category: selectedCategory,
        description: description || '无备注',
        payerName: payer.userName,
        date: date,
        participants: participantList,
        userName: app.getUserInfo().userName
      },
      success: (res) => {
        if (res.result.success) {
          wx.showToast({
            title: '添加成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          this.setData({
            errorMessage: res.result.message || '添加失败',
            isLoading: false
          })
        }
      },
      fail: (err) => {
        console.error('添加支出失败:', err)
        this.setData({
          errorMessage: '网络错误，请稍后重试',
          isLoading: false
        })
      }
    })
  },

  // 在线提交更新
  submitUpdateOnline: function(expenseId, amount, selectedCategory, description, payer, date, participantList) {
    wx.cloud.callFunction({
      name: 'updateExpense',
      data: {
        expenseId,
        roomId: this.data.roomId,
        amount: parseFloat(amount),
        category: selectedCategory,
        description: description || '无备注',
        payerName: payer.userName,
        date: date,
        participants: participantList,
        userName: app.getUserInfo().userName
      },
      success: (res) => {
        if (res.result.success) {
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          this.setData({
            errorMessage: res.result.message || '保存失败',
            isLoading: false
          })
        }
      },
      fail: (err) => {
        console.error('更新支出失败:', err)
        this.setData({
          errorMessage: '网络错误，请稍后重试',
          isLoading: false
        })
      }
    })
  },

  // 删除支出
  onDelete: function() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这笔支出记录吗？此操作无法撤销。',
      success: (res) => {
        if (res.confirm) {
          this.doDelete()
        }
      }
    })
  },

  // 执行删除
  doDelete: function() {
    this.setData({ isLoading: true })

    wx.cloud.callFunction({
      name: 'deleteExpense',
      data: {
        expenseId: this.data.expenseId,
        roomId: this.data.roomId,
        userName: app.getUserInfo().userName
      },
      success: (res) => {
        if (res.result.success) {
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          wx.showToast({
            title: res.result.message || '删除失败',
            icon: 'error'
          })
          this.setData({ isLoading: false })
        }
      },
      fail: (err) => {
        console.error('删除支出失败:', err)
        wx.showToast({
          title: '网络错误',
          icon: 'error'
        })
        this.setData({ isLoading: false })
      }
    })
  },

  // 取消
  onCancel: function() {
    wx.navigateBack()
  }
})