// app.js
App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d6g3k6zud55005d96',
        traceUser: true,
      })
    }

    // 生成或获取匿名用户ID
    this.generateAnonymousUserId()
  },

  globalData: {
    userId: null,
    userName: '',
    avatarUrl: '',
    currentRoom: null,
  },

  // 生成或获取匿名用户ID
  generateAnonymousUserId: function() {
    const that = this
    try {
      let userId = wx.getStorageSync('anonymousUserId')
      let userName = wx.getStorageSync('userName')
      let avatarUrl = wx.getStorageSync('avatarUrl')

      if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 10000)
        wx.setStorageSync('anonymousUserId', userId)
        console.log('生成新的匿名用户ID:', userId)
      }

      if (userName) {
        that.globalData.userName = userName
      }
      if (avatarUrl) {
        that.globalData.avatarUrl = avatarUrl
      }

      that.globalData.userId = userId
      console.log('使用匿名用户ID:', userId)

    } catch (e) {
      console.error('生成匿名用户ID失败:', e)
      that.globalData.userId = 'temp_' + Date.now()
    }
  },

  // 更新用户信息（昵称和头像）
  updateUserInfo: function(userName, avatarUrl) {
    if (userName && userName.trim()) {
      this.globalData.userName = userName.trim()
      wx.setStorageSync('userName', userName.trim())
    }
    if (avatarUrl) {
      this.globalData.avatarUrl = avatarUrl
      wx.setStorageSync('avatarUrl', avatarUrl)
    }
  },

  // 兼容旧方法
  updateUserName: function(userName) {
    this.updateUserInfo(userName, this.globalData.avatarUrl)
  },

  // 更新云端数据中的用户名
  updateUserNameInCloud: function(oldName, newName) {
    const db = wx.cloud.database()
    const _ = db.command

    // 更新 room_members 中的 userName
    db.collection('room_members').where({
      userName: oldName
    }).update({
      data: {
        userName: newName
      }
    }).then(res => {
      console.log('更新 room_members:', res)
    }).catch(err => {
      console.error('更新 room_members 失败:', err)
    })

    // 更新 expenses 中的 payerName
    db.collection('expenses').where({
      payerName: oldName
    }).update({
      data: {
        payerName: newName
      }
    }).then(res => {
      console.log('更新 expenses payerName:', res)
    }).catch(err => {
      console.error('更新 expenses payerName 失败:', err)
    })

    // 更新 expenses 中的 createdByName
    db.collection('expenses').where({
      createdByName: oldName
    }).update({
      data: {
        createdByName: newName
      }
    }).then(res => {
      console.log('更新 expenses createdByName:', res)
    }).catch(err => {
      console.error('更新 expenses createdByName 失败:', err)
    })

    // 更新 expense_history 中的 userName
    db.collection('expense_history').where({
      userName: oldName
    }).update({
      data: {
        userName: newName
      }
    }).then(res => {
      console.log('更新 expense_history userName:', res)
    }).catch(err => {
      console.error('更新 expense_history userName 失败:', err)
    })
  },

  // 获取用户信息
  getUserInfo: function() {
    return {
      userId: this.globalData.userId,
      userName: this.globalData.userName,
      avatarUrl: this.globalData.avatarUrl
    }
  },

  // 设置当前房间
  setCurrentRoom: function(roomInfo) {
    this.globalData.currentRoom = roomInfo
    wx.setStorageSync('currentRoom', roomInfo)
    // 保存到已加入房间列表
    this.addToJoinedRooms(roomInfo)
  },

  // 获取当前房间
  getCurrentRoom: function() {
    return this.globalData.currentRoom || wx.getStorageSync('currentRoom')
  },

  // 清除当前房间
  clearCurrentRoom: function() {
    this.globalData.currentRoom = null
    wx.removeStorageSync('currentRoom')
  },

  // 添加到已加入房间列表
  addToJoinedRooms: function(roomInfo) {
    try {
      let rooms = wx.getStorageSync('joinedRooms') || []
      // 检查是否已存在
      const index = rooms.findIndex(r => r.roomId === roomInfo.roomId)
      if (index >= 0) {
        // 更新已存在的房间
        rooms[index] = roomInfo
      } else {
        // 添加新房间
        rooms.unshift(roomInfo) // 添加到列表开头
      }
      // 最多保存10个房间
      if (rooms.length > 10) {
        rooms = rooms.slice(0, 10)
      }
      wx.setStorageSync('joinedRooms', rooms)
    } catch (e) {
      console.error('保存已加入房间失败:', e)
    }
  },

  // 获取已加入房间列表
  getJoinedRooms: function() {
    return wx.getStorageSync('joinedRooms') || []
  },

  // 从已加入房间列表移除
  removeFromJoinedRooms: function(roomId) {
    try {
      let rooms = wx.getStorageSync('joinedRooms') || []
      rooms = rooms.filter(r => r.roomId !== roomId)
      wx.setStorageSync('joinedRooms', rooms)
    } catch (e) {
      console.error('移除已加入房间失败:', e)
    }
  },

  // ========== 离线支出相关 ==========

  // 获取离线支出列表
  getOfflineExpenses: function() {
    try {
      return wx.getStorageSync('offlineExpenses') || []
    } catch (e) {
      console.error('获取离线支出失败:', e)
      return []
    }
  },

  // 保存离线支出
  saveOfflineExpense: function(expense) {
    try {
      const offline = this.getOfflineExpenses()
      offline.push({
        ...expense,
        offlineId: 'offline_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        savedAt: new Date().toISOString()
      })
      wx.setStorageSync('offlineExpenses', offline)
      console.log('离线支出已保存, 当前共', offline.length, '条')
    } catch (e) {
      console.error('保存离线支出失败:', e)
    }
  },

  // 删除单条离线支出
  removeOfflineExpense: function(offlineId) {
    try {
      let offline = this.getOfflineExpenses()
      offline = offline.filter(e => e.offlineId !== offlineId)
      wx.setStorageSync('offlineExpenses', offline)
    } catch (e) {
      console.error('删除离线支出失败:', e)
    }
  },

  // 清空离线列表
  clearOfflineExpenses: function() {
    try {
      wx.removeStorageSync('offlineExpenses')
    } catch (e) {
      console.error('清空离线支出失败:', e)
    }
  }
})