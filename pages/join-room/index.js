// pages/join-room/index.js
const app = getApp()

Page({
  data: {
    roomCode: '',
    isLoading: false,
    errorMessage: ''
  },

  onLoad: function() {
  },

  // 处理房间码输入
  onRoomCodeInput: function(e) {
    const value = e.detail.value.replace(/[^0-9]/g, '') // 只允许数字
    this.setData({
      roomCode: value.substring(0, 6) // 限制6位
    })
  },

  // 验证输入
  validateInput: function() {
    const { roomCode } = this.data

    if (!roomCode || roomCode.length !== 6) {
      this.setData({
        errorMessage: '请输入6位数字房间密码'
      })
      return false
    }

    if (!/^\d{6}$/.test(roomCode)) {
      this.setData({
        errorMessage: '房间密码必须是6位数字'
      })
      return false
    }

    return true
  },

  // 加入房间
  onJoinRoom: function() {
    if (!this.validateInput()) {
      return
    }

    const app = getApp()
    const userInfo = app.getUserInfo()
    const { roomCode } = this.data

    this.setData({
      isLoading: true,
      errorMessage: ''
    })

    // 调用云函数加入房间
    wx.cloud.callFunction({
      name: 'joinRoom',
      data: {
        roomCode,
        userId: userInfo.userId,
        userName: userInfo.userName,
        avatarUrl: userInfo.avatarUrl || ''
      },
      success: (res) => {
        if (res.result.success) {
          const { roomId, roomCode, roomName } = res.result
          console.log('成功加入房间:', res.result)

          // 设置当前房间
          const roomInfo = {
            roomId,
            roomCode,
            roomName,
            isCreator: false // 加入者不是创建者
          }
          app.setCurrentRoom(roomInfo)

          // 跳转到房间详情页
          wx.navigateTo({
            url: `/pages/room-detail/index?roomId=${roomId}`
          })
        } else {
          this.setData({
            errorMessage: res.result.message || '加入房间失败',
            isLoading: false
          })
        }
      },
      fail: (err) => {
        console.error('加入房间失败:', err)
        this.setData({
          errorMessage: '网络错误，请稍后重试',
          isLoading: false
        })
      }
    })
  },

  // 跳转到创建房间页面
  goToCreateRoom: function() {
    wx.navigateTo({
      url: '/pages/create-room/index'
    })
  }
})