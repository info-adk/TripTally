// pages/index/index.js
const app = getApp()

Page({
  data: {
    userName: '',
    tempNickname: '',
    showNicknameModal: false,
    isEditingNickname: false
  },

  onLoad: function() {
    this.checkAuth()
  },

  onShow: function() {
    this.checkAuth()
  },

  checkAuth: function() {
    const userInfo = app.getUserInfo()
    const hasNickname = !!(userInfo.userName && userInfo.userName.trim() !== '')
    this.setData({
      userName: userInfo.userName || '',
      showNicknameModal: !hasNickname
    })
  },

  onNicknameInput: function(e) {
    this.setData({
      tempNickname: e.detail.value
    })
  },

  onConfirmNickname: function() {
    const { tempNickname } = this.data
    if (!tempNickname || !tempNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    const nickName = tempNickname.trim()
    app.updateUserInfo(nickName, '')
    this.setData({
      userName: nickName,
      showNicknameModal: false,
      tempNickname: ''
    })
    wx.showToast({ title: '设置成功', icon: 'success' })
  },

  onEditNickname: function() {
    this.setData({
      isEditingNickname: true,
      tempNickname: this.data.userName
    })
  },

  onCancelEdit: function() {
    this.setData({
      isEditingNickname: false,
      tempNickname: ''
    })
  },

  onConfirmUpdateNickname: function() {
    const { tempNickname, userName } = this.data
    if (!tempNickname || !tempNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    const newNickname = tempNickname.trim()
    if (newNickname === userName) {
      this.setData({ isEditingNickname: false })
      return
    }

    wx.cloud.callFunction({
      name: 'updateUserNickname',
      data: {
        oldNickname: userName,
        newNickname: newNickname
      },
      success: (res) => {
        console.log('昵称同步更新:', res)
        app.updateUserName(newNickname)
        this.setData({
          userName: newNickname,
          isEditingNickname: false,
          tempNickname: ''
        })
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      },
      fail: (err) => {
        console.error('昵称更新失败:', err)
        wx.showToast({ title: '更新失败', icon: 'none' })
      }
    })
  },

  goToCreateRoom: function() {
    if (!this.checkAuthAndTip()) return
    wx.navigateTo({
      url: '/pages/create-room/index'
    })
  },

  goToJoinRoom: function() {
    if (!this.checkAuthAndTip()) return
    wx.navigateTo({
      url: '/pages/join-room/index'
    })
  },

  goToMyRooms: function() {
    if (!this.checkAuthAndTip()) return
    wx.navigateTo({
      url: '/pages/my-rooms/index'
    })
  },

  checkAuthAndTip: function() {
    const userInfo = app.getUserInfo()
    if (!userInfo.userName) {
      wx.showToast({ title: '请先填写昵称', icon: 'none' })
      return false
    }
    return true
  }
})